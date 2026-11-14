# One controlled two-core guest comparison

Baseline is exact public `487c67f6da8aadb5bf722e94c2786dea9b7ad668`. The prior screenshot visibly showed Android “System UI isn't responding” over the Irth opening logo. This identifies the reported system component, not the app or resource root cause. No permission, Close app, or Wait action was taken. The earlier App.getState bridge failure remains separate.

## Source basis and bounded change

Official AOSP emulator command option source at immutable `a44127e76ec2ebf0fb9ba9f7907ba32cfa8bf32e/android/android-emu/android/cmdline-options.h` declares `-cores <number>`: https://android.googlesource.com/platform/external/qemu/+/a44127e76ec2ebf0fb9ba9f7907ba32cfa8bf32e/android/android-emu/android/cmdline-options.h . This proves documented source support, not attestation of the installed emulator binary.
Android's AVD documentation describes the Multi-Core CPU setting: https://developer.android.com/studio/run/managing-avds . GitHub's standard runner table lists macos-15-intel as four CPUs and 14 GB RAM: https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job . No saturation or CPU starvation was measured, and neither source proves this change resolves the observed ANR.

Only the independent visual route opts into `-cores 2`. Device rejects booleans, strings and all other non-None values. The existing default argv remains identical, and no host configuration, KVM/HVF permissions, graphics, image, RAM, heap, display, boot or launch timeout changes. Boot still requires exact sys.boot_completed=1 under its existing 900-second ceiling. Single launch, installed digest, same-run artifact identity, source/receipt/file hashes and final APK manifest checks remain intact. No CDP, taps or repeated dispatch.

Before installation, the trial records requested cores separately from the effective owned AVD hardware-qemu.ini values and `/sys/devices/system/cpu/online`. It requires effective hardware core count 2 and exact online set {0,1}; unavailable, duplicates, malformed ranges, extra cores or capture/cleanup failure stop as unsupported. Known prior comparison values are emulator37.2.13/image2.0.0/platform-tools37.0.1/build-tools35.0.0, RAM2560MiB/heap576/display320x640. These must match or the comparison is unsupported. Density and other existing numeric fields remain recorded without inventing a baseline. The guest query is bounded3s/128bytes with inherited owned-probe reap allowance. No raw configuration paths/output is published.

The existing screenshot+hierarchy observation and separate release-blocked outcome remain unchanged. A readable screen is not proof of six features or native bridge success. A repeated System UI ANR ends this runner/image approach: no automatic larger core allocation, timeout extension, Wait/Close, or retry. A positive sample also does not establish causal repair or reliability.

## Cost and integrity

Current same-run/source-hash transfer rules do not permit quietly using an older run's APK. Re-running the old job cannot incorporate changed guest arguments. Therefore this trial preserves one normal build and same-run verified transfer; a cross-run binary-reuse protocol would require new review and is outside scope. No duplicate app-free comparison is requested. Native runtime/publication remains coordinator-owned.

## Offline evidence and scope

Six new focused tests passed: strict argument types; actual mocked Device.boot argv equivalence except two-core suffix; online CPU range parser; effective positive; missing/mismatched/cleanup-uncertain observations; actual main mismatch stopping before install/launch and still cleaning up. Ten existing visual controls passed. No SDK, emulator, app or server ran locally. This sparse restoration is not a complete repository tree; only four candidate paths (runner.py, visual_observation.py, new test_two_core_trial.py, this audit) may be overlaid on the exact public source. Independent final static review CLEAR, with six new and ten existing visual tests independently rerun successfully. The latest487 screenshot run did not record full effective configuration/tool versions, so comparison constants are known-prior evidence, not freshly measured487 values.
