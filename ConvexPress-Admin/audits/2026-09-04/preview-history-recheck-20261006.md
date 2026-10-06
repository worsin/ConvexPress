# Native history-preview continuity recheck — 2026-10-06

E99 remains an intermittent observation under the final integrated preview gate. Three bounded current native reproductions restored the selected revision automatically, without Reconnect. There is no established cause justifying a speculative lifecycle patch.

Artifacts: `output/preview-history-20261006/`. Owned page `g184eygxf7p7cvz8jhq1sw5wm18fs5n7`:

1. Minimal heading: revision 3 restored earlier revision 2 as revision 4; the earlier heading returned automatically.
2. Full Field Guide plus Studio Services: revision 6 restored revision 5 as revision 7; earlier content returned automatically.
3. With Studio Services selected: revision 7 restored revision 6 as revision 8; authored cards returned automatically.

Temporary lifecycle tracing showed old-revision cleanup, new-revision begin, received/rendered acknowledgements and continued renewal. The temporary instrumentation was removed byte-for-byte. `restored-native.txt` contains both the host rendered state and the actual authored iframe heading. The inspected screenshot records revision history with only a partial preview visible; it is not independent full-content visual proof.

`cleanup.json` records all 71 original pages and settings preserved, owned page recoverably trashed, both API sessions revoked with refresh refused 401, native Live selection restored and signout observed, owned native 84587 and Website 84611 stopped, private profile removed and all seven protected processes alive. Keep the original mismatch in the register for Task 8, without counting these passing reproductions as a repair or letting repeated investigation prevent confirmed implementation work.
