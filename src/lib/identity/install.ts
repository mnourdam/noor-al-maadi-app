// Side-effect entry: install the identity storage partition as early as
// possible in every runtime (web client, SSR-hydrated client, Android).
// Importing this module before any feature module guarantees that no
// personal key is ever written to a global namespace.
import { installIdentityPartition } from "./partition";

installIdentityPartition();

export { installIdentityPartition };
