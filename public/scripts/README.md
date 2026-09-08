# Script logos

Drop a logo image here named after the script id, as `.png`:
`tb.png`, `bmr.png`, `sv.png`, `everyone-can-play.png`, `hide-and-seek.png`,
`lunar-eclipse.png`, `trust.png`, `boozling.png`, `minotaurs-labyrinth.png`.

The id is what's in `characters.json`'s `meta.editions`, not the script's
display name — "Hide & Seek" is `hide-and-seek.png`, not
`Logo_hide_and_seek.png` or `hide-and-seek.jpg`. Only `.png` is read; other
extensions are silently ignored.

This folder is gitignored (except this file). A script with no logo falls
back to its hand-drawn icon automatically, so a partial set is fine.
