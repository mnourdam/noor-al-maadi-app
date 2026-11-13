# Native acceptance Python environment correction

Public source `0923ffc1` has tree `a8f23bb7071d542cc9e31848f0d8f35737c24bfb`, identical to local parent `23f7c1c1`. The local commit identity is not the public commit identity.

The reported macOS run stopped at Homebrew Python PEP 668 system-pip installation before APK build, installation, or emulator acceptance. This test-only workflow change creates a virtual environment in `RUNNER_TEMP`; its explicit Python executable installs the same pinned websocket-client 1.8.0 and runs Python guards, APK producer, and device runner. System Python only creates the virtual environment. No system-package override, host security change, SDK license acceptance, application change, or dependency-lock regeneration is introduced.

Static controls reject system-pip/mixed-interpreter counterfactuals and preserve always-retained failure evidence and nonzero failures. Existing producer failure-receipt controls remain unchanged. No macOS environment installation or Android runtime has been executed for this correction locally; CI must establish that setup proceeds and reveal any later blockers. The six fixture groups and `release_ready=false` contract are unchanged.
