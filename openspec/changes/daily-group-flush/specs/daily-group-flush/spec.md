## ADDED Requirements

### Requirement: Realtime capture stays in the inbox

The system SHALL accept OneBot group message posts at `/api/webhooks/onebot` only when `ONEBOT_ACCESS_TOKEN` matches. It SHALL ignore posts from groups other than `ONEBOT_GROUP_ID` when that variable is set. It SHALL ignore non-group posts and posts with no text. Accepted posts SHALL be desensitized with the existing cleaner and stored as a JSON string in `live_inbox`. They MUST NOT be inserted into `chat_messages` at receive time.

#### Scenario: Authorized group text is staged

- **WHEN** NapCat posts a group text message for the configured group with a valid token
- **THEN** `live_inbox` gains one JSON payload and `chat_messages` does not gain a row

#### Scenario: Wrong group is dropped

- **WHEN** a group message arrives for a group id other than `ONEBOT_GROUP_ID`
- **THEN** nothing is added to `live_inbox`

#### Scenario: Duplicate message id is ignored

- **WHEN** a second post arrives with the same `source_msg_id` already in `live_inbox`
- **THEN** the inbox still contains one row for that id

### Requirement: Daily flush at 04:00 Asia/Shanghai

The system SHALL flush unflushed inbox rows once each Asia/Shanghai calendar day, and only when the local hour in Asia/Shanghai is 4 or later. A flush SHALL bundle the pending JSON strings into one `zzz-archive` version 1 document, pass that document through the existing archive parser, and insert the result as an active import batch named `onebot-daily-YYYY-MM-DD.json`. Rows that were flushed MUST NOT be inserted again.

#### Scenario: Before 04:00 nothing is imported

- **WHEN** the server checks at 03:59 Asia/Shanghai and the inbox has pending rows
- **THEN** no new import batch is created

#### Scenario: At 04:00 pending rows become an archive batch

- **WHEN** the server checks at 04:00 Asia/Shanghai or later and today has not been flushed
- **THEN** pending inbox rows are written to `chat_messages` under a new active `onebot-daily-` batch and marked flushed

#### Scenario: Restart after 04:00 catches up once

- **WHEN** the server starts after 04:00 Asia/Shanghai and today's flush has not run
- **THEN** it flushes once, and a later check the same day does not flush again

### Requirement: Downstream features follow the archive

After a successful flush, the system SHALL recompute source counts for agent personas whose QQ appears in the flushed messages and is already bound. It SHALL embed only message ids that are not already in `chat_embeddings` for those QQs. It MUST NOT rewrite stored persona system prompts. Leaderboard, hour timeline, and word cloud SHALL read the new active batch on the next stats page load, with the existing bot-name filters still applied to the word cloud and agent corpus.

#### Scenario: Bound agent count and embeddings update

- **WHEN** a flushed message belongs to a QQ that already has an enabled agent persona
- **THEN** that persona's source count is refreshed and any new corpus lines are embedded without changing the stored system prompt

#### Scenario: Stats see the new batch

- **WHEN** a visitor opens the fun-stats page after the flush
- **THEN** leaderboard and hour buckets include the flushed messages, and the word cloud still excludes bot-name lines
