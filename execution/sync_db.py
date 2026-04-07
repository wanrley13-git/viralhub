import asyncio
from database import engine, Base
from models import *

async def sync():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Migração concluída.")

asyncio.run(sync())
