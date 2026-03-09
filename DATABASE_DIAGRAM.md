# Database Diagram (Complete)

This document describes the full database structure defined in `prisma/schema.prisma`.

## Entity-Relationship Diagram (Mermaid)

```mermaid
erDiagram
    USER {
        INT id PK
        STRING username UK
        STRING password_hash
        ENUM role
        STRING full_name
        STRING email
        STRING phone_number
        STRING photo_url
        DATETIME created_at
    }

    SALESPERSON {
        INT id PK
        INT user_id UK, FK
        STRING name
        STRING region
        DECIMAL monthly_target
    }

    CUSTOMER {
        INT id PK
        STRING name
        STRING phone_number
        STRING address
        ENUM status
    }

    PRODUCT {
        INT id PK
        STRING name
        STRING description
        STRING category
        DECIMAL unit_price
        DECIMAL pcs_per_dozen
        DECIMAL pcs_per_box
        STRING photo_url
        BOOLEAN is_active
    }

    INVENTORY {
        INT product_id PK, FK
        INT quantity
    }

    "ORDER" {
        INT id PK
        INT customer_id FK
        INT salesperson_user_id FK
        DECIMAL total_amount
        ENUM status
        DATETIME created_at
        ENUM payment_type
        STRING remark
    }

    ORDER_ITEM {
        INT id PK
        INT order_id FK
        INT product_id FK
        INT quantity
        STRING unit_type
        DECIMAL unit_price
    }

    PAYMENT {
        INT id PK
        INT customer_id FK
        INT order_id FK
        INT collected_by_user_id FK
        DECIMAL amount_paid
        ENUM payment_type
        ENUM status
        DATETIME created_at
    }

    LOAN {
        INT id PK
        INT customer_id FK
        INT order_id UK, FK
        DECIMAL original_amount
        DECIMAL remaining_amount
        ENUM status
    }

    LEDGER_ENTRY {
        INT id PK
        DATE entry_date
        ENUM type
        ENUM category
        INT reference_id
        DECIMAL amount
        STRING description
        BOOLEAN is_system_generated
    }

    DAILY_BALANCE {
        DATE date PK
        DECIMAL opening_balance
        DECIMAL closing_balance
    }

    EMPLOYEE {
        INT id PK
        STRING name
        STRING phone
        STRING address
        STRING position
        DECIMAL basic_salary
        DATE start_date
        STRING remark
        DATETIME created_at
    }

    SALARY_RECORD {
        INT id PK
        INT employee_id FK
        STRING salary_month
        DECIMAL basic_salary
        DECIMAL bonus_amount
        JSON bonus_types
        DECIMAL deduction_amount
        DECIMAL net_salary
        DATE payment_date
        STRING remark
        DATETIME created_at
    }

    CATEGORY {
        INT id PK
        STRING name UK
        DATETIME created_at
    }

    EXPENSE {
        INT id PK
        STRING expenseCode UK
        STRING category
        STRING description
        DECIMAL amount
        ENUM payment_method
        DATE expense_date
        DATETIME created_at
    }

    SYSTEM_SETTINGS {
        INT id PK
        STRING system_name
        STRING system_logo
        DATETIME updated_at
    }

    USER ||--o| SALESPERSON : "has profile"
    USER ||--o{ "ORDER" : "creates (salesperson_user_id)"
    USER ||--o{ PAYMENT : "collects (collected_by_user_id)"

    CUSTOMER ||--o{ "ORDER" : "places"
    CUSTOMER ||--o{ PAYMENT : "makes"
    CUSTOMER ||--o{ LOAN : "has"

    PRODUCT ||--o| INVENTORY : "stock record"
    PRODUCT ||--o{ ORDER_ITEM : "appears in"

    "ORDER" ||--o{ ORDER_ITEM : "contains"
    "ORDER" ||--o{ PAYMENT : "paid by"
    "ORDER" ||--o| LOAN : "may create"

    EMPLOYEE ||--o{ SALARY_RECORD : "has salary history"
```

## Enum Reference

- `Role`: `ADMIN`, `SALESPERSON`
- `CustomerStatus`: `ACTIVE`, `INACTIVE`
- `OrderStatus`: `PENDING_ADMIN`, `CONFIRMED`, `CANCELLED`, `DELIVERED`
- `PaymentType`: `CASH`, `BANK`
- `PaymentStatus`: `PENDING`, `CONFIRMED`, `REJECTED`
- `LoanStatus`: `OPEN`, `CLOSED`
- `LedgerType`: `DEBIT`, `CREDIT`
- `LedgerCategory`: `SALE`, `SALARY`, `EXPENSE`, `OTHER_INCOME`

## Notes

- `LedgerEntry.reference_id` is an application-level reference (polymorphic style) and is not enforced with a DB foreign key.
- `Category` and `Expense.category` are not currently linked via a foreign key.
- `SystemSettings` is designed as a singleton row (`id = 1` default).
