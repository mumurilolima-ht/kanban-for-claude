# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-08

### Added

- Kanban board of the desktop app's sessions in a pane next to the conversation, opened with `/kanban` or `/dash`.
- Lanes by work stage (Sem status, A fazer, Precisa de atenção, Fazendo, Feito, Revisar, Arquivar), with the sidebar section as the card's label.
- Drag and drop between lanes, with stages saved in one store shared by every session and app window, safe with several boards open.
- Card section picker with "Fixado", expandable titles, "Abrir", and a right-click menu with Abrir, Renomear and Arquivar.
- Search by title, section and conversation text; sorting; filters, including "Só aguardando sua ação".
- Waiting reports: a blinking yellow dot on sessions stopped on a permission prompt, a question or a plan.
- "Arquivar" lane with "[ARQUIVAR TODAS]", archiving only the chosen sessions and keeping their linked sessions active.
- First-run section mapping, asked once per machine.
