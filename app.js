
import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc,
  addDoc, updateDoc, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen");
const appScreen = $("appScreen");
const content = $("pageContent");
const modalRoot = $("modalRoot");

let currentUser = null;
let currentMember = null;
let currentPage = "overview";
let cache = { members: [], projects: [], tasks: [], leads: [], activities: [], productAnalytics: [], productActivity: [] };
let toastTimer;

const titles = {
  overview: "Founder Overview", employees: "Staff Management", projects: "Projects",
  tasks: "Tasks", clients: "Client CRM", activity: "Activity Log", apps: "App Analytics"
};

const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function notify(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

function failText(error) {
  const code = error?.code || "";
  const messages = {
    "auth/unauthorized-domain": "Firebase mein GitHub Pages domain authorize karo.",
    "auth/popup-closed-by-user": "Login window band ho gayi. Dobara try karo.",
    "permission-denied": "Permission nahi hai. Firebase rules aur member role check karo.",
    "auth/popup-blocked": "Browser popup block kar raha hai. Popup allow karo."
  };
  return messages[code] || error?.message || "Kuch galat ho gaya.";
}

function isFounder() {
  return currentMember?.role === "founder";
}

function isManager() {
  return ["founder", "manager"].includes(currentMember?.role);
}

function dateText(value) {
  if (!value) return "No date";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" :
    date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(status = "open") {
  const good = ["completed", "active", "won"];
  const warning = ["in progress", "in_progress", "contacted", "proposal"];
  const bad = ["blocked", "lost", "inactive"];
  const s = String(status).toLowerCase().replaceAll("_", " ");
  const cls = good.includes(s) ? "green" : warning.includes(s) ? "yellow" : bad.includes(s) ? "red" : "";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

async function loadCollection(name, max = 100) {
  const q = query(collection(db, name), orderBy("createdAt", "desc"), limit(max));
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (error.code === "permission-denied") throw error;
    // Empty collections may not yet have documents or an orderable timestamp.
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, max);
  }
}

async function loadData() {
  const [members, projects, tasks, leads, activities] = await Promise.all([
    loadCollection("members"),
    loadCollection("projects"),
    loadCollection("tasks"),
    loadCollection("leads"),
    loadCollection("activities", 30),
    loadCollection("productAnalytics", 20),
    loadCollection("productActivity", 50)
  ]);
  cache = { members, projects, tasks, leads, activities, productAnalytics, productActivity };
}

async function logActivity(action, details) {
  await addDoc(collection(db, "activities"), {
    actorUid: currentUser.uid,
    actorName: currentMember.name || currentUser.displayName || "Team member",
    action,
    details,
    createdAt: serverTimestamp()
  });
}

async function refresh() {
  content.innerHTML = '<div class="loading">Updating workspace…</div>';
  try {
    await loadData();
    renderPage();
  } catch (error) {
    content.innerHTML = `<div class="panel"><h3>Could not load data</h3><p class="muted">${esc(failText(error))}</p></div>`;
  }
}

function stat(label, value, foot) {
  return `<div class="stat-card"><div class="stat-label">${esc(label)}</div>
    <div class="stat-number">${value}</div><div class="stat-foot">${esc(foot)}</div></div>`;
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

function activityRows(items) {
  if (!items.length) return empty("No activity yet.");
  return `<div class="list">${items.map(item => `
    <div class="list-row"><div><strong>${esc(item.action || "Update")}</strong>
    <small>${esc(item.details || "")} · ${esc(item.actorName || "Team member")}</small></div>
    <small>${esc(dateText(item.createdAt))}</small></div>`).join("")}</div>`;
}

function renderOverview() {
  const myTasks = cache.tasks.filter(t => t.assigneeUid === currentUser.uid);
  const openTasks = cache.tasks.filter(t => t.status !== "completed");
  const activeProjects = cache.projects.filter(p => p.status !== "completed");
  const metric = id => {
    const row = cache.productAnalytics.find(item => item.id === id);
    return Number.isFinite(row?.totalUsers) ? row.totalUsers.toLocaleString("en-IN") : "Not connected";
  };
  return `
    <div class="page-heading"><div><h3>Welcome, ${esc(currentMember.name || currentUser.displayName || "Team member")}</h3>
    <p>Your company workspace at a glance.</p></div><button class="primary-btn" data-action="new-task">+ New task</button></div>
    <div class="stats-grid">
      ${stat("Team members", cache.members.filter(m => m.active !== false).length, "Registered accounts")}
      ${stat("Active projects", activeProjects.length, "Projects in progress")}
      ${stat("Open tasks", openTasks.length, "Tasks not completed")}
      ${stat("My tasks", myTasks.length, "Assigned to you")}
      ${stat("FF League users", metric("ff-league"), "Synced from FF League Firebase")}
      ${stat("Study Shelf users", metric("study-shelf"), "Synced from Study Shelf Firebase")}
    </div>
    <div class="content-grid">
      <div class="panel"><h3>Recent tasks</h3>
      ${cache.tasks.slice(0, 5).length ? `<div class="list">${cache.tasks.slice(0, 5).map(t => `
        <div class="list-row"><div><strong>${esc(t.title)}</strong><small>Due: ${esc(dateText(t.dueDate))}</small></div>${statusBadge(t.status)}</div>`).join("")}</div>` : empty("No tasks created yet.")}</div>
      <div class="panel"><h3>Recent activity</h3>${activityRows(cache.activities.slice(0, 5))}</div>
    </div>`;
}

function renderEmployees() {
  const rows = cache.members.filter(m => m.active !== false);
  return `<div class="page-heading"><div><h3>Team directory</h3><p>Internal team member details.</p></div>
    ${isFounder() ? '<button class="primary-btn" data-action="invite-member">+ Add staff</button>' : ""}</div>
    <div class="card-grid">${rows.map(m => `<div class="item-card">
      <div class="panel-head"><span class="badge">${esc(m.role || "employee")}</span>${statusBadge("active")}</div>
      <h3>${esc(m.name || "Team member")}</h3><p>${esc(m.email || "")}</p>
      <p>${esc(m.department || "No department assigned")}</p>
      ${isManager() ? `<div class="item-meta"><button class="secondary-btn" data-action="edit-member" data-id="${esc(m.id)}">Edit details</button></div>` : ""}
    </div>`).join("") || empty("No team members found.")}</div>`;
}

function renderProjects() {
  return `<div class="page-heading"><div><h3>Projects</h3><p>Track company products and ongoing work.</p></div>
    ${isManager() ? '<button class="primary-btn" data-action="new-project">+ New project</button>' : ""}</div>
    <div class="card-grid">${cache.projects.map(p => `<div class="item-card">
      ${statusBadge(p.status)}<h3>${esc(p.name)}</h3><p>${esc(p.description || "No description added.")}</p>
      <div class="item-meta"><span class="badge">Owner: ${esc(p.ownerName || "Unassigned")}</span></div>
      <p>Due: ${esc(dateText(p.dueDate))}</p>
    </div>`).join("") || empty("No projects yet. Add your first project.")}</div>`;
}

function renderTasks() {
  return `<div class="page-heading"><div><h3>Task board</h3><p>See assigned work and task status.</p></div>
    ${isManager() ? '<button class="primary-btn" data-action="new-task">+ New task</button>' : ""}</div>
    <div class="card-grid">${cache.tasks.filter(t => isManager() || t.assigneeUid === currentUser.uid).map(t => `
      <div class="item-card">${statusBadge(t.status)}<h3>${esc(t.title)}</h3><p>${esc(t.description || "No description.")}</p>
      <p>Assigned to: ${esc(t.assigneeName || "Unassigned")}</p><p>Due: ${esc(dateText(t.dueDate))}</p>
      <div class="item-meta">${(t.assigneeUid === currentUser.uid || isManager()) ? `
        <button class="secondary-btn" data-action="task-status" data-id="${esc(t.id)}">Update status</button>` : ""}</div></div>`
    ).join("") || empty("No tasks available for your account.")}</div>`;
}

function renderClients() {
  return `<div class="page-heading"><div><h3>Client CRM</h3><p>Manage client enquiries and follow-ups. Visible to authorized team members.</p></div>
    ${isManager() ? '<button class="primary-btn" data-action="new-lead">+ Add enquiry</button>' : ""}</div>
    <div class="panel"><div class="list">${cache.leads.map(l => `<div class="list-row">
      <div><strong>${esc(l.name || "Unnamed lead")}</strong><small>${esc(l.company || "Individual")} · ${esc(l.email || "")}</small>
      <small>${esc(l.phone || "")} · ${esc(l.notes || "")}</small></div>
      <div>${statusBadge(l.status)} ${isManager() ? `<button class="secondary-btn" data-action="lead-status" data-id="${esc(l.id)}">Change</button>` : ""}</div>
    </div>`).join("") || empty("No client enquiries have been added.")}</div></div>`;
}

function renderActivity() {
  const productEvents = cache.productActivity.map(item => ({
    ...item,
    action: item.action || "Product activity",
    details: "[" + (item.appName || item.app || "Product") + "] " + (item.details || ""),
    actorName: item.actorName || "App user"
  }));
  const timeOf = value => value?.toDate ? value.toDate().getTime() : new Date(value || 0).getTime();
  const events = [...cache.activities, ...productEvents].sort((a,b) => timeOf(b.createdAt)-timeOf(a.createdAt));
  return `<div class="page-heading"><div><h3>Company activity</h3><p>Recent portal and connected product events.</p></div></div>
    <div class="panel">${activityRows(events.slice(0,50))}</div>`;
}

function renderApps() {
  const apps = [
    { id: "ff-league", name: "FF League", url: "https://gk2391888-cmd.github.io/ff-leauge-final/" },
    { id: "study-shelf", name: "Study Shelf / IITM SOLUTIONS", url: "https://gk2391888-cmd.github.io/study-shelf/" }
  ];
  return `<div class="page-heading"><div><h3>App analytics</h3><p>Counts are displayed only after a trusted backend syncs real data.</p></div></div>
    <div class="card-grid">${apps.map(app => {
      const data = cache.productAnalytics.find(item => item.id === app.id);
      const count = Number.isFinite(data?.totalUsers) ? data.totalUsers.toLocaleString("en-IN") : "Not connected";
      const active = Number.isFinite(data?.activeUsers) ? data.activeUsers.toLocaleString("en-IN") : "—";
      return `<div class="item-card">
        <span class="badge ${data ? "green" : "yellow"}">${data ? "Connected" : "Setup required"}</span>
        <h3>${esc(app.name)}</h3>
        <p>Total users: <strong>${esc(count)}</strong></p>
        <p>Active users: <strong>${esc(active)}</strong></p>
        <p>Last sync: ${esc(data?.updatedAt ? dateText(data.updatedAt) : "Not available")}</p>
        <div class="item-meta"><a class="secondary-btn" href="${app.url}" target="_blank" rel="noopener noreferrer">Open app ↗</a></div>
      </div>`;
    }).join("")}</div>
    <div class="panel" style="margin-top:18px"><h3>Analytics connection status</h3>
      <p class="muted">FF League uses its own Realtime Database and Study Shelf uses a separate Firebase project. This portal cannot safely enumerate either project's Authentication users from browser code. A trusted server-side connector must publish aggregate documents to <code>productAnalytics</code> and approved activity events to <code>productActivity</code>. Wallet balances, tokens and private profile data should never be copied here.</p>
    </div>`;
}

function renderPage() {
  $("pageTitle").textContent = titles[currentPage] || "Overview";
  document.querySelectorAll(".nav-link").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.page === currentPage));
  const pages = {
    overview: renderOverview, employees: renderEmployees, projects: renderProjects,
    tasks: renderTasks, clients: renderClients, activity: renderActivity, apps: renderApps
  };
  content.innerHTML = (pages[currentPage] || renderOverview)();
}

function showModal(title, fields, onSubmit, submitLabel = "Save") {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">
    <div class="panel-head"><h2>${esc(title)}</h2><button class="icon-btn secondary-btn" data-close>✕</button></div>
    <form id="modalForm"><div class="form-grid">${fields}</div>
    <div class="form-actions"><button type="button" class="secondary-btn" data-close>Cancel</button>
    <button class="primary-btn" type="submit">${esc(submitLabel)}</button></div></form>
    <p id="modalMsg" class="message"></p></div></div>`;

  modalRoot.querySelectorAll("[data-close]").forEach(btn =>
    btn.addEventListener("click", () => modalRoot.innerHTML = ""));
  $("modalForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("modalForm").querySelector('[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await onSubmit(data);
      modalRoot.innerHTML = "";
      notify("Saved successfully.");
      await refresh();
    } catch (error) {
      $("modalMsg").textContent = failText(error);
      button.disabled = false;
    }
  });
}

function field(name, label, type = "text", required = false, value = "") {
  const safe = esc(value);
  if (type === "textarea") return `<div class="field full"><label>${esc(label)}</label><textarea name="${name}" ${required ? "required" : ""}>${safe}</textarea></div>`;
  return `<div class="field"><label>${esc(label)}</label><input name="${name}" type="${type}" value="${safe}" ${required ? "required" : ""}></div>`;
}

function selectField(name, label, options, value = "") {
  return `<div class="field"><label>${esc(label)}</label><select name="${name}">${options.map(o =>
    `<option value="${esc(o)}" ${o === value ? "selected" : ""}>${esc(o.replaceAll("_", " "))}</option>`
  ).join("")}</select></div>`;
}

async function createRecord(collectionName, data) {
  await addDoc(collection(db, collectionName), {
    ...data, createdAt: serverTimestamp(), createdBy: currentUser.uid
  });
}

async function handleAction(action, id) {
  if (action === "new-project" && isManager()) {
    showModal("Create project",
      field("name", "Project name", "text", true) +
      field("description", "Description", "textarea") +
      field("dueDate", "Due date", "date") +
      selectField("status", "Status", ["active", "in_progress", "completed", "on_hold"], "active"),
      async d => {
        await createRecord("projects", {
          ...d, ownerUid: currentUser.uid,
          ownerName: currentMember.name || currentUser.displayName || ""
        });
        await logActivity("Project created", d.name);
      });
  }

  if (action === "new-task" && isManager()) {
    const options = cache.members.filter(m => m.active !== false)
      .map(m => `<option value="${esc(m.uid || m.id)}" data-name="${esc(m.name || "")}">${esc(m.name || m.email || m.id)}</option>`).join("");
    showModal("Create task",
      field("title", "Task title", "text", true) +
      field("description", "Description", "textarea") +
      `<div class="field"><label>Assign to</label><select name="assigneeUid" required>${options}</select></div>` +
      field("dueDate", "Due date", "date") +
      selectField("status", "Status", ["open", "in_progress", "completed", "blocked"], "open"),
      async d => {
        const member = cache.members.find(m => (m.uid || m.id) === d.assigneeUid);
        d.assigneeName = member?.name || member?.email || "";
        await createRecord("tasks", d);
        await logActivity("Task created", d.title);
      });
  }

  if (action === "invite-member" && isFounder()) {
    showModal("Register team member",
      field("uid", "Firebase Auth UID", "text", true) +
      field("name", "Full name", "text", true) +
      field("email", "Email", "email", true) +
      field("department", "Department") +
      selectField("role", "Role", ["employee", "manager"], "employee"),
      async d => {
        const uid = d.uid.trim();
        const email = d.email.trim().toLowerCase();
        const name = d.name.trim();
        if (!uid || !email || !name) throw new Error("UID, name and email are required.");
        const existing = await getDoc(doc(db, "members", uid));
        if (existing.exists()) throw new Error("This UID is already registered as a team member.");
        await setDoc(doc(db, "members", uid), {
          uid, name, email, department: d.department.trim(),
          role: d.role === "manager" ? "manager" : "employee",
          active: true, createdAt: serverTimestamp(), createdBy: currentUser.uid
        });
        await logActivity("Staff member added", name + " (" + d.role + ")");
      });
  }

  if (action === "edit-member" && isManager()) {
    const m = cache.members.find(item => item.id === id);
    if (!m) return;
    showModal("Edit member details",
      field("name", "Full name", "text", true, m.name) +
      field("department", "Department", "text", false, m.department) +
      field("jobTitle", "Job title", "text", false, m.jobTitle),
      async d => {
        await updateDoc(doc(db, "members", id), d);
        await logActivity("Team member updated", d.name);
      });
  }

  if (action === "task-status") {
    const t = cache.tasks.find(item => item.id === id);
    if (!t || (!isManager() && t.assigneeUid !== currentUser.uid)) return;
    showModal("Update task status",
      selectField("status", "Status", ["open", "in_progress", "completed", "blocked"], t.status || "open"),
      async d => {
        await updateDoc(doc(db, "tasks", id), d);
        await logActivity("Task status updated", `${t.title}: ${d.status}`);
      });
  }

  if (action === "new-lead" && isManager()) {
    showModal("Add client enquiry",
      field("name", "Contact name", "text", true) +
      field("company", "Company / organization") +
      field("email", "Email", "email") +
      field("phone", "Phone") +
      field("notes", "Enquiry notes", "textarea") +
      selectField("status", "Lead status", ["new", "contacted", "proposal", "won", "lost"], "new"),
      async d => {
        await createRecord("leads", d);
        await logActivity("Client enquiry added", d.name);
      });
  }

  if (action === "lead-status" && isManager()) {
    const lead = cache.leads.find(item => item.id === id);
    if (!lead) return;
    showModal("Change lead status",
      selectField("status", "Status", ["new", "contacted", "proposal", "won", "lost"], lead.status || "new"),
      async d => {
        await updateDoc(doc(db, "leads", id), d);
        await logActivity("Client status updated", `${lead.name}: ${d.status}`);
      });
  }
}

$("loginBtn").addEventListener("click", async () => {
  $("loginMsg").textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    $("loginMsg").textContent = failText(error);
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    currentPage = button.dataset.page;
    $("sidebar").classList.remove("open");
    renderPage();
  });
});

content.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (button) handleAction(button.dataset.action, button.dataset.id);
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) {
    currentMember = null;
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    return;
  }

  try {
    const memberSnap = await getDoc(doc(db, "members", user.uid));
    if (!memberSnap.exists() || memberSnap.data().active !== true) {
      await signOut(auth);
      $("loginMsg").textContent = "Access not approved. Founder se apna account authorize karwao.";
      loginScreen.classList.remove("hidden");
      appScreen.classList.add("hidden");
      return;
    }

    currentMember = { id: memberSnap.id, ...memberSnap.data() };
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    $("userName").textContent = currentMember.name || user.displayName || "Team member";
    $("userRole").textContent = currentMember.role || "employee";
    $("userPhoto").src = user.photoURL || "";
    await refresh();
  } catch (error) {
    $("loginMsg").textContent = failText(error);
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    await signOut(auth);
  }
});
