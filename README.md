
# THE TECH HUB — Company Portal

Private internal management portal for THE TECH HUB.

## Features
- Google authentication
- Founder, manager and employee roles
- Team directory
- Projects and task management
- Client enquiry CRM
- Activity feed
- Responsive dashboard

## Setup

1. Create a Firebase project.
2. Register a Firebase Web App.
3. Copy its web configuration into `firebase-config.js`.
4. Enable Google sign-in in Firebase Authentication.
5. Add your GitHub Pages domain under Firebase Authentication
   settings > Authorized domains.
6. Create a Cloud Firestore database.
7. Publish `firestore.rules` in Firestore > Rules.
8. Create a GitHub repository named `company-portal`.
9. Upload these files to the repository root.
10. Open repository Settings > Pages.
11. Choose Deploy from a branch, select `main` and `/(root)`.
12. Open:
    https://gk2391888-cmd.github.io/company-portal/

## Authorize the founder

1. Open the deployed portal and sign in with Google once.
2. In Firebase Console, open Authentication > Users.
3. Copy the exact UID for your Google account.
4. Open Firestore > Data.
5. Create a collection named `members` if it does not exist.
6. Create a document whose document ID is exactly your UID.
7. Add these fields:

   uid: your exact Firebase Auth UID (string)
   name: your name (string)
   email: your Google account email (string)
   role: founder (string)
   active: true (boolean)

8. Sign out and sign in again.

## Add team members

Each team member should sign in once using Google. Find their UID under
Firebase Authentication > Users, then create a `members/{uid}` document
using that exact UID. Assign only the required role: employee or manager.
Set `active` to the boolean value true.

Never share passwords or grant founder privileges casually.

## Notes

- Firebase web configuration identifies the Firebase project; it is not
  a server-side secret. Keep privileged service-account credentials private.
- GitHub Pages hosts static files only. Firestore and Firebase Authentication
  provide the backend.
- The internal CRM is not a public enquiry form.
- Test access rules with separate founder, manager, employee and
  unauthorized accounts before using real company/client data.
