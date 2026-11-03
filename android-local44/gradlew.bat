@echo off
setlocal
cd /d "%~dp0"
if not exist "gradle\wrapper\gradle-wrapper.jar" (
  echo [VoiceLine] Downloading official Gradle v8.10.2 wrapper JAR...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $u='https://raw.githubusercontent.com/gradle/gradle/v8.10.2/gradle/wrapper/gradle-wrapper.jar'; Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile 'gradle/wrapper/gradle-wrapper.jar'; Add-Type -AssemblyName System.IO.Compression; $f=[System.IO.Compression.ZipFile]::OpenRead((Resolve-Path 'gradle/wrapper/gradle-wrapper.jar')); try { if (-not ($f.Entries | Where-Object FullName -eq 'org/gradle/wrapper/GradleWrapperMain.class')) { throw 'Invalid Gradle wrapper JAR' } } finally {$f.Dispose()}"
  if errorlevel 1 (
    if exist "gradle\wrapper\gradle-wrapper.jar" del "gradle\wrapper\gradle-wrapper.jar"
    echo [VoiceLine] Official wrapper download failed. See README_AndroidStudio_KO.txt.
    exit /b 1
  )
)
if defined JAVA_HOME (
  set "JAVACMD=%JAVA_HOME%\bin\java.exe"
) else (
  set "JAVACMD=java"
)
"%JAVACMD%" -classpath "%~dp0gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%
