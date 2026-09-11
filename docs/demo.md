# Product walkthrough

Current review export: 3 minutes 58 seconds, with synthetic Fish Audio S2-Pro narration.

The current recording uses the final app from its normal Next.js entry point in an isolated, background instance of installed Google Chrome. It does not take over the user's browser or use a separate demo implementation.

The video reviews already-mined Sepolia transactions, then performs live Subgraph reads. No new payment transactions are submitted by its UI controls. The earlier ENS permission test is presented separately from the payment lifecycle.

Start with the buyer, supplier, and services. Show the partial payment, guardian pause, bilateral recovery, rejected old instruction, and final accounting. Finish by filtering actual Graph events and refreshing the indexed block. Show the relevant evidence before each spoken sentence.

The interface is neutral and compact. There are no animated explainer slides, music, decorative diagrams, or green effects. Captions sit below the recorded app, without covering its controls or balances.

The narration was generated locally with Fish Audio S2-Pro from the authorized WhatsApp reference supplied by the builder. It is synthetic speech, not a recording of the referenced speaker reading the script. Fish's hosted API returned `402`, so the final voice was generated entirely on this Mac without sending the reference audio or API credential again.

Each of the 59 complete sentences was generated and trimmed as a separate audio file. The 35 editor-added pauses exist only between sentence files, so the editor cannot split a word. Fish S2-Pro receives a restrained delivery cue for each sentence, while captions contain only the clean narration. The complete edit then receives one uniform 1.20× speed change across the screen, cursor, captions, and voice. Local Whisper `base.en` was used to review the encoded result and repair ambiguous amounts, proper nouns, and safety claims; no OpenRouter credential was used or stored.

The cursor is AppKit's native macOS artwork driven by the browser's real mouse events. Its 65 purposeful movements use asymmetric curves, distance-aware timing, varied target hovers, and occasional settling corrections. Four required scrolls use eased wheel profiles. The motion audit rejects repeated timing or straight mechanical paths; the capture contains no decorative jitter or purposeless scrolling.

Local renders, captions, narration, and timed scene maps are kept in the ignored `artifacts/` directory. They are uploaded separately from the source repository when a submission platform requires them.

The current source capture, motion audit, Fish sentence audio, local Whisper review, captions, and render are kept in ignored `.runtime/video-v11/`.
