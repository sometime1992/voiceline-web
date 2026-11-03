@echo off
setlocal
cd /d "%~dp0"
node --test local_tests/voiceline.test.cjs local_tests/adaptive_layout.test.cjs local_tests/local32.test.cjs local_tests/local33.test.cjs local_tests/local34.test.cjs local_tests/local35.test.cjs local_tests/local36.test.cjs local_tests/local39.test.cjs local_tests/guide_training.test.cjs local_tests/touch_controls.test.cjs local_tests/native_documents.test.cjs local_tests/warmup.test.cjs local_tests/metronome.test.cjs local_tests/piano_load.test.cjs local_tests/native_bridge.test.cjs local_tests/native_files.test.cjs
exit /b %ERRORLEVEL%
