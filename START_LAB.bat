@echo off
cd /d "%~dp0"
echo Checking Selenium is installed...
python -m pip install --quiet --upgrade selenium
python aces_helper.py
pause
