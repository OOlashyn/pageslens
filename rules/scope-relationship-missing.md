# scope-relationship-missing

**Default: error**

A table permission uses Contact, Account or Parent scope but doesn't name the relationship that scope needs:

| Scope   | Required field        |
| ------- | --------------------- |
| Contact | `contactrelationship` |
| Account | `accountrelationship` |
| Parent  | `parentrelationship`  |

## Why it matters

The relationship tells Power Pages which records belong to the signed-in contact, their account, or the parent record. Without it the scope can't be applied. Microsoft's own tooling refuses to create such a permission.

## How to fix

Set the relationship name (the relationship's schema name) on the permission, or change the scope if the relationship isn't what was meant.
