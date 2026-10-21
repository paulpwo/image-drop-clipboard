# image-drop-clipboard

A Claude Code mod that turns a dragged image into a real image attachment.

When you drag an image file into the Claude Code prompt (for example the floating screenshot thumbnail on macOS), most terminals paste its **path** as text. This mod catches that path, removes it from the input and puts the **image itself** on the clipboard. Press `Ctrl+V` and Claude Code attaches it as `[Image #N]`, exactly like a regular paste.

- No simulated keystrokes, no Accessibility permissions: you decide when to paste.
- Works in any terminal, because it runs inside Claude Code, not the terminal.
- Your screenshot workflow stays the same: if you don't drag the thumbnail, macOS saves it where it always does.

## Install

At the prompt of a Claude Code session:

```
/plugin install image-drop-clipboard --marketplace paulpwo/image-drop-clipboard
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install image-drop-clipboard --marketplace paulpwo/image-drop-clipboard
```

## Usage

1. Take a screenshot (`Cmd+Shift+4` on macOS) and drag the floating thumbnail into the Claude Code prompt. Any image file dragged from Finder works too.
2. A toast says `Image copied to clipboard — press Ctrl+V to attach it`, and the path disappears from the input.
3. Press `Ctrl+V`.

## How it works

A `prompt.edit` hook watches pastes. Terminals often deliver a drop in several chunks, so after each paste the mod looks at the whole prompt for an image path the paste just completed. It accepts shell-escaped paths, quoted paths and `file://` URLs for `png`, `jpg`, `jpeg`, `gif`, `webp`, `tiff`, `heic` and `bmp` files that exist on disk.

- **macOS:** `osascript` sets the clipboard as PNG; other formats are converted with `sips` first.
- **Linux:** `wl-copy` (Wayland) or `xclip` (X11), whichever is installed.

If the clipboard can't be set, the path is left in the input untouched.

## Limitations

- Any pasted text that is exactly an existing image path is intercepted. To type a path as text, type it rather than paste it.
- Windows is not supported yet.

## License

MIT
