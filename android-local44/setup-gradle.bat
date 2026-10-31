@echo off
setlocal
cd /d "%~dp0"
echo [VoiceLine] Installing the official Gradle wrapper on this PC if needed.
call "%~dp0gradlew.bat" --version
if errorlevel 1 (
  echo [VoiceLine] Gradle initialization failed.
  echo Connect to the Internet and verify that Java 17 and PowerShell are available.
  echo You can also download gradle-wrapper.jar manually from:
  echo https://raw.githubusercontent.com/gradle/gradle/v8.10.2/gradle/wrapper/gradle-wrapper.jar
  echo Save it to this project's gradle\wrapper\ directory.
  pause
  exit /b 1
)
echo [VoiceLine] Gradle wrapper ready. Open this folder in Android Studio.
pause
