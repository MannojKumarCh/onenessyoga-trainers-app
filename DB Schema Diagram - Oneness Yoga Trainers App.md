# DB Schema Diagram — Oneness Yoga Trainers App

**Database:** PostgreSQL (`OnenessYogaTrainersApp`) via Prisma ORM 6.19.3
**Source of truth:** `backend/prisma/schema.prisma`
**Last generated:** 12 July 2026

Renders natively on GitHub and in VS Code (with a Mermaid preview extension).

```mermaid
erDiagram
    users {
        int id PK
        string name
        string email UK
        string password_hash
        Role role
        string zoom_link
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    sessions {
        int id PK
        string title
        string scheduled_date
        string scheduled_time
        string session_type
        int assigned_trainer_id FK
        string zoom_link
        string notes
        boolean is_completed
        datetime completed_at
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    leaves {
        int id PK
        int trainer_id FK
        string from_date
        string to_date
        string reason
        LeaveStatus status
        string admin_note
        int reviewed_by FK
        datetime reviewed_at
        datetime created_at
        datetime updated_at
    }

    sequences {
        int id PK
        string week_start_date
        string scheduled_date
        string topic
        int assigned_trainer_id FK
        string google_sheet_link
        string instructions
        SequenceStatus status
        int created_by FK
        datetime uploaded_at
        datetime notified_trainer_at
        datetime notified_team_at
        datetime created_at
        datetime updated_at
    }

    resources {
        int id PK
        string name
        ResourceType type
        int parent_id FK
        string url
        string thumbnail_url
        int sort_order
        int created_by FK
        datetime created_at
        datetime updated_at
    }

    push_subscriptions {
        int id PK
        int user_id FK
        string endpoint UK
        string subscription_json
        datetime created_at
    }

    users ||--o{ sessions       : "assigned_trainer_id"
    users ||--o{ sessions       : "created_by"
    users ||--o{ leaves         : "trainer_id"
    users ||--o{ leaves         : "reviewed_by"
    users ||--o{ sequences      : "assigned_trainer_id"
    users ||--o{ sequences      : "created_by"
    users ||--o{ resources      : "created_by"
    users ||--o{ push_subscriptions : "user_id"
    resources ||--o{ resources  : "parent_id (self-referencing)"
```

## Enums

| Enum | Values |
|---|---|
| `Role` | `super_admin`, `sequence_creator`, `trainer` |
| `LeaveStatus` | `pending`, `approved`, `rejected` |
| `SequenceStatus` | `pending`, `uploaded` |
| `ResourceType` | `folder`, `link` |

## Notes

- All foreign keys reference `users.id` except `resources.parent_id`, which self-references `resources.id` (cascade delete — deleting a folder deletes its children).
- Field names are snake_case to match the original SQLite schema, so API responses and the frontend needed no changes after the Postgres migration.
- `sessions.assigned_trainer_id` uses `onDelete: SetNull`; `leaves.trainer_id` and `push_subscriptions.user_id` use `onDelete: Cascade`.
- Update this file whenever `schema.prisma` changes, and reference it from the PRD (Section 6.1a).
