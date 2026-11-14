/** Explicit build opt-in. Neither attachment shape nor caller data grants protocol authority. */
export const canonicalFeedbackEnabled = import.meta.env.VITE_FEEDBACK_CANONICAL_ENABLED === 'true';
export const feedbackAttachmentProtocol: 'legacy' | 'canonical-v1' = canonicalFeedbackEnabled ? 'canonical-v1' : 'legacy';
