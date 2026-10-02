# Posts and comments

The Flutter journey uses canonical body, declaredCreationMode, and reply
parentId fields. Creation and text edits require an explicit Human-authored
or AI-assisted declaration. Existing public-content and device-integrity
policies remain authoritative.

Submission acknowledgements and locally retained edits show pending publication
checks. Only the author sees edit and delete controls, and deletion requires a
matching server acknowledgement before the client removes content.

Within one application session, an uncertain mutation retains its replay key
and frozen payload across retries and screen navigation. Conflicting edits
and deletes are held until that attempt is resolved. Definitive failures allow
a fresh attempt. This registry is in memory; process termination or browser
reload does not retain it.

The current backend post/comment GETs expose allowed content only. A newly
submitted or edited item can therefore become unavailable when reopened even
by its owner. A coordinated owner-only read contract and durable recovery
journal are follow-up work; public read restrictions must remain intact.

Regression coverage lives in test/features/feed/application/content_mutation_test.dart,
test/features/feed/presentation/post_comment_journey_test.dart, and the existing
feed, composer, repository, network, and policy suites. These checks use synthetic
fixtures. Real-email/signup and exact-SHA owner acceptance remain separate gates.
