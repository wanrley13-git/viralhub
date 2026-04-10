"""Change order_index from INTEGER to BIGINT in notes and note_folders.

Timestamps used as order_index values exceed int32 range (2,147,483,647).
This migration widens the column to BIGINT to accommodate them.

Revision ID: 014
Revises: 013
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("note_folders") as batch_op:
        batch_op.alter_column(
            "order_index",
            existing_type=sa.Integer,
            type_=sa.BigInteger,
            existing_nullable=False,
            existing_server_default="0",
        )

    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column(
            "order_index",
            existing_type=sa.Integer,
            type_=sa.BigInteger,
            existing_nullable=False,
            existing_server_default="0",
        )


def downgrade():
    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column(
            "order_index",
            existing_type=sa.BigInteger,
            type_=sa.Integer,
            existing_nullable=False,
            existing_server_default="0",
        )

    with op.batch_alter_table("note_folders") as batch_op:
        batch_op.alter_column(
            "order_index",
            existing_type=sa.BigInteger,
            type_=sa.Integer,
            existing_nullable=False,
            existing_server_default="0",
        )
