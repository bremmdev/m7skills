# How screen reader modes work

Desktop screen readers on Windows and Linux read a web page from their own copy of it, a flat document they move through with the keyboard. That's **browse mode**. To type in a field or work a widget, keys have to go to the page instead: **focus mode**. The page doesn't choose the mode, but its roles decide when the screen reader switches, and `role="application"` takes browse mode away. VoiceOver and TalkBack have no modes.

## The modes

| Screen reader | Reading | Interacting | No browse mode | Switching by hand |
| --- | --- | --- | --- | --- |
| JAWS | Virtual PC Cursor | Forms Mode | Virtual cursor off: inside `role="application"`, or Insert+Z | Enter enters forms mode; Escape or Numpad Plus leaves; Insert+Z turns the virtual cursor off and on |
| NVDA | Browse mode | Focus mode | Inside `role="application"`: no browse mode document at all | NVDA+Space toggles; Escape leaves a focus mode NVDA switched to by itself |
| Narrator | Scan mode | Scan mode off | | Narrator+Space (Caps Lock or Insert + Space) |
| Orca | Browse mode | Focus mode | Inside `role="application"`: focus mode; on the page's root, sticky focus mode for the whole page | Orca+A |
| VoiceOver (macOS) | No modes: commands use the VO keys (Control+Option); Quick Nav, when the user turns it on, takes the arrow keys | | | |
| VoiceOver (iOS), TalkBack | No modes: gestures move through everything, and a hardware keyboard's commands use modifiers | | | |

NVDA plays a sound when the mode changes and JAWS indicates forms mode (both configurable), so users notice; they don't always know why, or how to get back.

## What browse mode keeps from the page

In browse mode, these keys never reach the page:

- **Arrow keys, Home, End, Page Up, Page Down**: they move through the screen reader's copy line by line, word by word.
- **Letters and digits**: quick navigation (H heading, B button, F form field, E edit field, T table, 1–6 heading levels).
- **Enter and Space** activate the element under the virtual cursor, as a click. A component that acts on `keydown` for Enter or Space may not run; one that acts on `click` does.

**Tab and Shift+Tab** pass through: they move real focus, and the virtual cursor follows. Moving the virtual cursor with arrows or quick keys doesn't move focus (NVDA removed its option for that in 2025.1, #17598).

So a key handler for arrows, Home/End, letters or Space on an element that doesn't switch the mode never runs for JAWS, NVDA and Narrator users. The component looks fine with a keyboard and with VoiceOver, and does nothing with a Windows screen reader.

## What makes them switch

| Trigger | JAWS (Auto Forms Mode, default) | NVDA (default settings) | Narrator | Orca (default settings) |
| --- | --- | --- | --- | --- |
| Focus lands on it: Tab, click, or `element.focus()` | Forms mode for edit fields, combo boxes, spin controls, list controls, tab controls, menu bars, tree views and grid cells; leaves forms mode on buttons and check boxes; radio buttons keep the current mode | Focus mode for the roles in [`roles.md`](roles.md) ("Automatic focus mode for focus changes", on) | Scan mode off in edit fields | Focus mode for its "focus mode widgets" ("Native navigation triggers focus mode", on) |
| The virtual cursor arrives on it (arrows) | Edit fields only; never with Semi-Auto Forms Mode | Nothing ("Automatic focus mode for caret movement", off) | Edit fields | Nothing ("Caret navigation triggers focus mode", off) |
| Quick navigation keys (E, F, B, …) | Never by default | Never | | Never ("Structural navigation triggers focus mode", off) |
| Enter or Space on it | Enter enters forms mode on controls that need it | Switches on controls that need it; on a tab, activates it | | |
| Leaving | Tab to a button or check box, Escape, Numpad Plus, or an arrow past the edge of an edit field | Tab to an element that doesn't need it, or Escape when NVDA switched by itself | Up or Down Arrow out of the edit field | Tab to an element that doesn't need it, or Orca+A |

Things that follow from the table:

- **Script focus counts.** A dialog that focuses its first text field, a menu button that focuses the first item, a combobox that moves focus: each switches the mode exactly like Tab. A dialog opening on a text field starts in focus mode, so the user hears the field, not the dialog's text.
- **Focus switches, reading doesn't.** Users who arrow through a page reach a widget in browse mode and hear its role ("tab", "menu", "grid"). The role is what tells them to press Enter or Tab into it. A widget with no role gives no hint.
- **The element focus lands on decides,** not its container: a `role="tablist"` switches because its tabs do. With `aria-activedescendant`, NVDA, JAWS and Orca follow the active descendant.
- **Ancestors matter in three places:** NVDA and Orca switch for anything focused inside a `toolbar`; Orca for anything inside a `grid`, `treegrid`, `menu` or `tree`; everyone for anything inside `role="application"`, unless a `role="document"` sits between.

## What users lose in focus mode

Quick navigation and arrow reading stop. Users hear only what focus lands on (its name, role, states and description) and live regions. Text inside a widget that isn't part of an item's name or description can't be reached until they switch back. Leaving focus mode by hand is easy for experts (NVDA+Space, Escape, Numpad Plus) and unknown to many others.

## What browse mode doesn't show

From NVDA's browse mode renderer (`gecko_ia2.cpp`, used for Chrome, Edge and Firefox) and Freedom Scientific's notes:

- **`role="application"`** (not on the document root): one object, "application" and its name. Its content isn't in browse mode; Enter on it moves focus in. NVDA+Space can force browse mode inside. JAWS turns the virtual cursor off while focus is inside.
- **`role="dialog"` and `alertdialog`**: one object in the page. Once focus is inside, NVDA gives the dialog a browse mode of its own (since NVDA 2017.4), unless the dialog is inside an application.
- **Listboxes** (unless read-only) **and trees**: only the selected item. JAWS "may show only one item of a tree control".
- **Comboboxes**: the value, not the options.

`role="document"` inside an application gives browse mode back (JAWS, NVDA, Orca): that's how a web app keeps a readable part, such as a message body in a mail client.

## Settings and browsers

Users change all of this: JAWS has Auto, Semi-Auto and Manual Forms Mode; NVDA lets users turn automatic focus mode off; experienced users switch by hand. Design for the defaults and never depend on them: every widget announces a role, so users know a switch is needed, and every action works with Tab, Enter and Space or with the keys of a role that switches.

The predictions in this skill assume Chrome or Edge on Windows. NVDA's rules read the accessibility states the browser exposes, and Firefox exposes a few differently (read-only states on lists and grids), so test Firefox with NVDA too. Chromium marks these roles read-only unless they're editable, which keeps NVDA in browse mode on them: `article`, `definition`, `document`, `img`, `list`, `listitem`, `progressbar`, `term`, `timer`, `toolbar`, `tooltip`.

## Sources

- NVDA source: [`browseMode.py`](https://github.com/nvaccess/nvda/blob/master/source/browseMode.py) (`shouldPassThrough`, `ALWAYS_SWITCH_TO_PASS_THROUGH_ROLES`, `SWITCH_TO_PASS_THROUGH_ON_FOCUS_ROLES`), [`ia2Web.py`](https://github.com/nvaccess/nvda/blob/master/source/NVDAObjects/IAccessible/ia2Web.py) (`Application`, `Document`), [`behaviors.py`](https://github.com/nvaccess/nvda/blob/master/source/NVDAObjects/behaviors.py) (`WebDialog`), [`gecko_ia2.cpp`](https://github.com/nvaccess/nvda/blob/master/nvdaHelper/vbufBackends/gecko_ia2/gecko_ia2.cpp) (what browse mode renders); checked October 2026
- [NVDA User Guide: Browse Mode and Browse Mode settings](https://www.nvaccess.org/files/nvda/documentation/userGuide.html#BrowseMode); [NVDA changes](https://github.com/nvaccess/nvda/blob/master/user_docs/en/changes.md): web dialogs in browse mode (2017.4, #4493), toolbars (#1339), grids (#1763, #5118, #12413), trees (#3023), tabs (#1760), message lists (#13221)
- Chromium: [`ax_role_properties.cc`](https://github.com/chromium/chromium/blob/main/ui/accessibility/ax_role_properties.cc) (`ShouldHaveReadonlyStateByDefault`) and [`ax_platform_node_win.cc`](https://github.com/chromium/chromium/blob/main/ui/accessibility/platform/ax_platform_node_win.cc)
- Orca source: [`document_presenter.py`](https://github.com/GNOME/orca/blob/main/src/orca/document_presenter.py) (`is_focus_mode_widget`, `use_focus_mode`, sticky focus mode for web apps), [`caret_navigator.py`](https://github.com/GNOME/orca/blob/main/src/orca/caret_navigator.py) and [`structural_navigator.py`](https://github.com/GNOME/orca/blob/main/src/orca/structural_navigator.py) (defaults); checked October 2026
- Freedom Scientific: [JAWS ARIA Support Notes and Key Concepts](https://freedomscientific.github.io/standards-support/aria.html) (Virtual Cursor, Forms Mode, Auto Forms Mode, radio buttons, tree controls), [bulletin 1665: role=application and role=document](https://support.freedomscientific.com/support/technicalsupport/bulletin/1665), [Semi-Auto Forms Mode](https://doccenter.freedomscientific.com/doccenter/doccenter/rs25c51746a0cc/2014-09-24_enhancedconvenientocrandsemi-autoformsmode/03_Semi-AutoFormsMode.htm); standards-support issues [#640](https://github.com/FreedomScientific/standards-support/issues/640) (role=application ignored), [#708](https://github.com/FreedomScientific/standards-support/issues/708) (check box in a toolbar), [#851](https://github.com/FreedomScientific/standards-support/issues/851) (custom listbox), [#853](https://github.com/FreedomScientific/standards-support/issues/853) (radio group with aria-activedescendant)
- Microsoft: [Narrator guide, chapter 3: Using scan mode](https://support.microsoft.com/en-us/accessibility/windows/narrator/chapter-3-using-scan-mode); [Q&A: Narrator doesn't switch for ARIA composite widgets](https://learn.microsoft.com/en-us/answers/questions/4342625/windows-narrator-does-not-support-automatic-switch)
- Apple: [VoiceOver User Guide: browse webpages](https://support.apple.com/guide/voiceover/browse-webpages-vo27974/mac); WebAIM, [Three things you should know before using VoiceOver for testing](https://webaim.org/blog/three-things-voiceover/)
- W3C: [WAI-ARIA 1.2 `application`](https://www.w3.org/TR/wai-aria-1.2/#application), [APG: Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- Léonie Watson, [Understanding screen reader interaction modes](https://tink.uk/understanding-screen-reader-interaction-modes/); Marco Zehe, [If you use the WAI-ARIA role "application", please do so wisely](https://www.marcozehe.de/if-you-use-the-wai-aria-role-application-please-do-so-wisely/); Vispero, [Event handling in JAWS and NVDA](https://vispero.com/resources/event-handling-in-jaws-and-nvda/); Jason Kiss, [ARIA Widgets and Focus/Forms Mode Support in JAWS and NVDA](https://accessibleculture.org/articles/2012/09/aria-widgets-and-focus-forms-mode-support/) (2012, historical)
