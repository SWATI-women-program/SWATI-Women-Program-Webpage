# ERP Webpage Setup & Deployment Guide

## 1. Google Apps Script Configuration (`Code.gs`)
1. Create a new Google Sheet named `Institutional_ERP_Database`.
2. Go to **Extensions -> Apps Script**.
3. Replace all code in `Code.gs` with the provided `Code.gs` content.
4. Click **Deploy -> New Deployment**.
5. Select Type: **Web App**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Deployment Web App URL and paste it into `scripts.js` under `DEPLOYMENT_WEB_APP_URL`.

## 2. Web Hosting
- Put `index.html`, `scripts.js`, `styles.css` along with institutional logo images (`SASTRA_Logo.jpg`, `Greaves_Logo.jpg`, `Swati_Logo.jpg`, `Pygmalion_Foundation_logo.jpg`) in the root directory.
- Test in browser directly or via any web server.