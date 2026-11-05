# Archeion

Product terminology for exploring a system's architecture, data flows, and changes across repositories.

## Language

**Overseer**:
The architect or developer using the architecture map to understand a system and supervise changes, including changes made by coding agents.

**System**:
The logical software system being explored as a whole, which can span multiple repositories.

**Capability**:
An identifiable behavior or responsibility provided by a part of the system.

**Flow**:
A path describing how requests, data, or messages move between connected parts of a system.

**Trail**:
A saved architectural investigation containing a question, notes, and a sequence of map viewpoints.
_Avoid_: Flow (reserved for movement through the system).

**Knowledge folder**:
A repository's committed collection of small architecture descriptions and statements of intent.

**Graph**:
A generated snapshot of architecture knowledge and facts extracted from repositories, used as the basis for the map.

**Viewer**:
The interface for exploring the generated graph through an overview, zoom levels, data flows, and eyes.

**Eye**:
A way of viewing the same architecture map that highlights a particular concern: structure (Atlas), flows (Tracer), changes (Radar), or reuse (Sonar). Eyes apply when exploring a repository, a project, or a connected platform.
