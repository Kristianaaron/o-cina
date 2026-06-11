"""Engine package — shared singletons and submodules."""
from app.engine.process_manager import ProcessManager
from app.engine.workflow_engine import WorkflowEngine
from app.engine.guardrails import GuardrailEngine
from app.engine.message_router import MessageRouter

# Singletons — shared across main.py and routers
process_manager = ProcessManager()
workflow_engine = WorkflowEngine()
guardrail_engine = GuardrailEngine()
message_router = MessageRouter()
