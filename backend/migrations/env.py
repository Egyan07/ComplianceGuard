from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

from app.core.database import Base
from app.core.config import settings

# Import all models so Base.metadata is populated
import app.models  # noqa: F401

config = context.config

# Set the database URL from app settings
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # If the caller pre-supplied a connection (e.g. the test harness injecting
    # an in-memory SQLite engine), use it directly so pytest can upgrade that
    # same DB to head without round-tripping through engine_from_config.
    injected = config.attributes.get("connection", None)
    if injected is not None:
        context.configure(connection=injected, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
