"""Test configuration and fixtures."""
import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use a temp file-based SQLite for tests (in-memory is unreliable with connection pooling)
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False, prefix="ocina_test_")
TEST_DB_URL = f"sqlite:///{_tmp_db.name}"
os.environ["DATABASE_URL"] = TEST_DB_URL

from app.database import Base, get_db, SessionLocal, engine
import app.models  # noqa: F401 — register all models with Base

# Create tables on the module-level engine
Base.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def truncate_tables():
    """Truncate all tables before each test for isolation."""
    from sqlalchemy import inspect
    insp = inspect(engine)
    with engine.connect() as conn:
        for table_name in reversed(insp.get_table_names()):
            conn.execute(Base.metadata.tables[table_name].delete())
        conn.commit()


@pytest.fixture
def test_db():
    """Shared test database session."""
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def client(test_db):
    """FastAPI TestClient using the shared test DB."""
    from fastapi.testclient import TestClient
    from app import main as main_mod

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    main_mod.app.dependency_overrides[get_db] = override_get_db
    with TestClient(main_mod.app) as c:
        yield c
    main_mod.app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup_db():
    """Remove temp DB file after all tests."""
    yield
    try:
        os.unlink(_tmp_db.name)
    except OSError:
        pass


@pytest.fixture
def temp_chroma():
    """Temporary ChromaDB directory for isolation."""
    with tempfile.TemporaryDirectory() as tmp:
        yield tmp
