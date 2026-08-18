# Security Review History

| Date       | Scope                                           | Critical | High | Medium | Result                                                                                                         |
| ---------- | ----------------------------------------------- | -------: | ---: | -----: | -------------------------------------------------------------------------------------------------------------- |
| 2026-08-18 | Full repository + live Supabase read-only audit |        0 |    0 |      5 | Four remediated in repository; live Supabase migration and leaked-password setting require deployment approval |
| 2026-08-08 | Full repository audit                           |        1 |    4 |      5 | Remediated in code; Supabase migration and conditional credential rotation remain operational follow-ups       |
