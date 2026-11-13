# Measured cold-boot budget and one-attempt installation receipts

Base: local d8f7a1a3cb7b9ae5fe6fb6b109030b225564b83f / tree d75ba31b517952a224e5917356dc11ce4e527d31, matching published 0e548. No local native runtime.

Run 43435942531, artifact 14043364998 SHA256 9bbe2831c3c023de2b5a32db3407d83d7195f3956954626280de9581ac1c5270, retained the original 300-second boot failure. Exploratory observation recorded install action, TimeoutExpired after 153.88 seconds, and sys.boot_completed changing from empty at entry to 1 at end. It did not verify installed bytes, launch or Home. This is evidence of later completion, not proof installation caused it. The previous owned AVD was removed; its uncertain install outcome cannot be retrospectively reconciled.

Authorized initial cold-boot budget is now bounded at 600 seconds, still requiring exactly sys.boot_completed=1 before the normal path. No substitute service predicate, setup bypass, software fallback or host change admits boot. Historical failures remain failures. The independent exploratory budget is unchanged.

Both normal and exploratory installation use one shared routine. A successful complete package list must prove the exact disposable acceptance package absent. Fixed receipt stages distinguish absence_check, install_command, pm_path, installed_hash and verified. The install_issued flag means dispatch attempted, not proven external effect: the exploratory bounded device can reject a just-expired deadline before spawning ADB. The remaining budget is checked before setting this flag; expiration directly after absence leaves it false and performs no reconciliation. The only install command is dispatched at most once; only successful path plus exact APK hash returns success. Install, path and hash timeouts retain their original stage/category and rethrow.

After an issued install fails, a separate read-only diagnostic allowance of 20 seconds queries a complete package list, exact package path, and bytes if available. It emits absent, present_unverified, exact_hash, hash_mismatch or unavailable. No raw package paths/listings are retained. Even exact_hash cannot promote failure to success or permit launch; there is no repeated install. Exploratory reconciliation uses the actual device with this separate bounded allowance, not an expired exploratory deadline. Existing cleanup remains the isolation boundary.

Offline controls include exact 600-second gate, single successful install/hash, present/unknown package denial, timeout plus matching reconciliation still raising, separate path/hash timeout receipts, absent/mismatch/invalid reconciliation and no retries. Existing boot diagnostic controls are adapted only to the authorized budget and shared verified-install call. Runtime and release acceptance remain pending.

Final offline suite: 102 Python controls pass; independent final review CLEAR, with 102/102 controls independently rerun.
