Set objFSO = CreateObject("Scripting.FileSystemObject")
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strScriptPath
WshShell.Run "cmd.exe /c cd backend && venv\Scripts\python -m uvicorn main:app --port 8000", 0, False
WshShell.Run "cmd.exe /c cd frontend && npm run dev", 0, False
