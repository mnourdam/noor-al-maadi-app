import {FeedbackImages} from './FeedbackImages';
import {canonicalFeedbackEnabled} from '@/lib/feedback/attachment-protocol';
/** Separate versioned server field preserves old attachments when a build opts in. */
export function FeedbackMessageImages({message}:{message:{attachments?:unknown[];canonical_attachments_v1?:unknown[]}}){
 return <><FeedbackImages protocol="legacy" attachments={message.attachments??[]}/>{canonicalFeedbackEnabled && <FeedbackImages protocol="canonical-v1" attachments={message.canonical_attachments_v1??[]}/>}</>;
}
