# 🎥 ConnectRoom v3 — Fixed & Working
### CodeAlpha Full Stack — Task 4

---

## ✅ Root Causes Fixed in v3

| Problem You Saw | Root Cause | Fix |
|----------------|-----------|-----|
| Page had no styling at all | CSS external file wasn't loading — bad folder path | **All CSS is now inline** inside each HTML file — zero file path issues |
| Room stuck on "Connecting…" | Socket.io session middleware wasn't sharing session properly | Fixed session middleware sharing using same instance |
| Whiteboard button did nothing | Whiteboard init ran before socket connected | Moved `WB.init()` inside `socket.on('connect')` |
| Video not connecting | WebRTC race condition + ICE candidates dropped | Perfect negotiation pattern + ICE buffering |
| Screen share broke connections | Wrong track replacement method | Proper `replaceTrack()` on all peer senders |

---

## 📁 Files (only 4 files needed!)

```
ConnectRoom_v3/
├── server.js          ← Backend (Express + Socket.io + WebRTC signalling)
├── package.json       ← Dependencies
└── public/
    ├── index.html     ← Login/Register (CSS fully inline)
    ├── dashboard.html ← Create/Join room (CSS fully inline)
    └── room.html      ← Conference room — video, chat, whiteboard, files (ALL inline)
```

**Why inline CSS?** Eliminates any possibility of static file serving issues (which caused your blank page).

---

## 🚀 HOW TO RUN — Step by Step

### Step 1: Check Node.js is installed
Open Command Prompt or Terminal and type:
```
node --version
```
It should show `v16.x.x` or higher. If not, download from: https://nodejs.org

---

### Step 2: Extract the ZIP
Unzip `ConnectRoom_v3.zip` to a folder, for example:
```
C:\Projects\ConnectRoom_v3\
```

---

### Step 3: Open terminal in that folder
**Windows:** Right-click the folder → "Open in Terminal"
OR open Command Prompt and type:
```
cd C:\Projects\ConnectRoom_v3
```

---

### Step 4: Install packages
```
npm install
```
Wait for it to finish (downloads express, socket.io, etc.)

---

### Step 5: Start the server
```
npm start
```

You should see:
```
╔══════════════════════════════════════╗
║  ConnectRoom v3                      ║
║  http://localhost:3000               ║
║  alice/demo1234  |  bob/demo1234     ║
╚══════════════════════════════════════╝
```

---

### Step 6: Open in browser
Go to: **http://localhost:3000**

---

## 🧪 Testing Each Feature

### Video Calls
1. Open two browser windows (or use Chrome + Edge)
2. Window 1: Login as `alice` / `demo1234`
3. Window 1: Create Room → copy the 6-char code
4. Window 2: Login as `bob` / `demo1234`
5. Window 2: Join Room → enter the code
6. ✅ Both should see each other's video

### Screen Sharing
1. Inside a room, click **🖥️ Share**
2. Browser asks which screen/window to share → select one
3. Others in the room see your screen
4. Click **⏹️ Stop** to stop

### Encrypted Chat
1. Click **💬 Panel** to open side panel
2. Toggle **🔒 Encrypt messages** ON
3. A secret key is auto-generated
4. **Copy the key** → share it with the other person (paste in their encrypt key field)
5. Send messages — they show with 🔒 badge
6. Both parties need the same key to read messages

### Whiteboard
1. Click **🎨 Board** — whiteboard opens (video hides)
2. Draw with pen, shapes, line, circle, rect
3. Other participants see your drawing in real-time
4. Click **💾** to save as PNG
5. Click **🎨 Board** again to go back to video

### File Sharing
1. Click **💬 Panel** → **📁 Files** tab
2. Click the drop zone or drag a file
3. File is uploaded and all participants get a download button

---

## 👤 Demo Accounts
Auto-created when server starts:

| Username | Password |
|----------|----------|
| alice    | demo1234 |
| bob      | demo1234 |

You can also register your own accounts.

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|---------|
| "Cannot find module" error | Run `npm install` again |
| Port 3000 already in use | Change PORT in server.js line 9 to 3001 |
| Camera/mic not working | Allow browser permission when asked; use Chrome or Edge |
| Video not connecting between tabs | Use two different browsers (Chrome + Edge) not two tabs |
| Screen share not available | Requires Chrome, Edge, or Firefox — not supported in Safari |
