KK Studio - AI Image Generation Workspace
==========================================

QUICK START
-----------
Double-click "KK Studio.exe" to launch the application.

Your browser will automatically open to http://localhost:3000


HOW TO USE
----------
1. STARTUP
   - Double-click: KK Studio.exe
   - First run will install dependencies (requires internet)
   - Browser opens automatically when ready

2. SHUTDOWN  
   - Double-click: stop.bat
   - This will stop the background service

3. API SETUP
   - Click the avatar icon (top-right corner)
   - Enter your Google Gemini API key
   - Key is saved locally, no need to re-enter


TROUBLESHOOTING
---------------
Q: Nothing happens when I start?
A: Make sure Node.js is installed (v18 or higher recommended).
   Download from: https://nodejs.org/

Q: "Cannot find startup.bat" error?
A: All files must be extracted together. Don't move KK Studio.exe alone.

Q: Image generation fails?
A: Check your API key validity and network connection.


FILES
-----
KK Studio.exe  - Main launcher (double-click to start)
startup.bat    - Startup script (called by exe)
stop.bat       - Stop service script
Build EXE.ps1  - Rebuild exe if needed
README.txt     - This file

==========================================
KK Studio v1.0.0 - Portable Edition
