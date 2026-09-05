# Missing summaries and translations

Query the declared target field with `{"filters":[{"field":"summary_en","op":"missing"}]}`. Missing means SQL NULL or text containing only ECMAScript whitespace, including tabs, newlines and nonbreaking spaces. Existing populated translations are excluded.

Prepare the normal proposal with `"mode":"fill-missing"`. Each replacement must be nonempty, and the server rejects a target that is already populated. Source text and other locales are unchanged. The original whole-record version also covers source text, so an external edit to the source or target blocks stale application.

For explicit cross-locale translation, also include `"translation":{"sourceField":"summary_fr","targetField":"summary_en"}`. Both fields need distinct locale declarations, the source must be readable/nonempty, and only the target may change. The agent supplies translated content; the human reviews its quality. PatchCTL performs no model calls. Without translation metadata, fill-missing also supports titles, summaries and declared text metadata.

For the first demo, fill ten missing English summaries from existing article content. If the query returns no eligible records, stop without creating an empty proposal.
