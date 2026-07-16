# Desktop wrapper

This directory contains only the optional Windows packaging layer. The web application in the repository root remains the single source of product behavior and UI.

The desktop build packages the current web interface together with the local raw-pixel TIFF backend:

```powershell
python -m pip install -r .\desktop\requirements.txt
powershell -ExecutionPolicy Bypass -File .\desktop\build.ps1 -PythonExe "C:\path\to\python.exe"
```

Do not implement product features directly in `desktop.py`; make them in the web application first.
