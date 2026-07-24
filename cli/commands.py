"""O-cina CLI commands — Click-based CLI for the Agent Command Center."""

import json
import sys
import time
from typing import Optional

import click
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.layout import Layout
from rich.panel import Panel
from rich.text import Text
from rich import box

from . import __version__
from .client import (
    ApiError,
    get_health,
    list_agents,
    get_agent,
    register_agent,
    start_agent,
    stop_agent,
    restart_agent,
    delete_agent,
    get_agent_logs,
    get_agent_metrics,
    prompt_agent,
    list_workflows,
    get_workflow,
    execute_workflow,
    validate_workflow,
    list_workflow_tasks,
    list_projects,
    get_project,
    create_project,
)

console = Console()

# ── Helpers ─────────────────────────────────────────────────────────────────


def _status_color(status: str) -> str:
    palette = {
        "running": "green",
        "starting": "yellow",
        "stopping": "yellow",
        "registered": "blue",
        "stopped": "white",
        "offline": "red",
        "error": "red",
    }
    return palette.get(status, "white")


def _format_time(ts: Optional[float]) -> str:
    if not ts:
        return "—"
    elapsed = time.time() - ts
    if elapsed < 60:
        return f"{elapsed:.0f}s ago"
    if elapsed < 3600:
        return f"{elapsed / 60:.0f}m ago"
    return f"{elapsed / 3600:.1f}h ago"


# ── Root ────────────────────────────────────────────────────────────────────


@click.group()
@click.option("--url", "-u", envvar="OCINA_API_URL", default="http://127.0.0.1:8002", help="Backend API URL")
@click.version_option(version=__version__, prog_name="o-cina")
@click.pass_context
def cli(ctx: click.Context, url: str):
    """O-cina — Agent Command Center CLI companion.

    Talk to a running O-cina backend to manage agents, workflows,
    and projects from the terminal.
    """
    ctx.ensure_object(dict)
    ctx.obj["BASE_URL"] = url


# ── Status ──────────────────────────────────────────────────────────────────


@cli.command()
@click.pass_context
def status(ctx: click.Context):
    """Show backend health and quick summary."""
    base = ctx.obj["BASE_URL"]
    try:
        health = get_health(base)
    except ApiError as e:
        console.print(f"[red]�[/] Backend unreachable: {e}")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]�[/] Connection failed: {e}")
        sys.exit(1)

    layout = Layout()
    layout.split_column(Layout(name="top"), Layout(name="bottom"))

    # Health panel
    comps = health.get("components", {})
    comp_lines = []
    for name, ok in comps.items():
        icon = "🟢" if ok == "ok" else "🔴"
        comp_lines.append(f"  {icon} {name}")
    layout["top"].update(
        Panel(
            "\n".join([
                f"[bold]Version:[/] {health.get('version', '?')}",
                f"[bold]Status:[/] [green]{health.get('status', '?')}[/]",
                "",
                "[bold]Components:[/]",
                *comp_lines,
            ]),
            title="[bold]O-cina Health[/]",
            box=box.ROUNDED,
        )
    )

    # Quick agent summary
    try:
        agents = list_agents(base, limit=5)
        running = sum(1 for a in agents if a.get("status") == "running")
        total = len(agents)
        layout["bottom"].update(
            Panel(
                f"[bold]Agents:[/] {total} total, [green]{running} running[/]",
                title="[bold]Quick Summary[/]",
                box=box.ROUNDED,
            )
        )
    except Exception:
        layout["bottom"].update(Panel("[yellow]Could not fetch agent list[/]", box=box.ROUNDED))

    console.print(layout)


# ── Agent Commands ──────────────────────────────────────────────────────────


@cli.group()
def agent():
    """Manage agents (list, start, stop, logs, prompt)."""
    pass


@agent.command("list")
@click.option("--harness", "-H", help="Filter by harness type")
@click.option("--status", "-s", help="Filter by status")
@click.option("--limit", "-l", default=50, show_default=True, help="Max results")
@click.pass_context
def agent_list(ctx, harness, status, limit):
    """List registered agents."""
    base = ctx.obj["BASE_URL"]
    try:
        agents = list_agents(base, harness=harness, status=status, limit=limit)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    if not agents:
        console.print("[yellow]No agents found.[/]")
        return

    table = Table(box=box.SIMPLE, header_style="bold")
    table.add_column("ID", style="dim")
    table.add_column("Name")
    table.add_column("Harness")
    table.add_column("Status")
    table.add_column("Model")
    table.add_column("Uptime")

    for a in agents:
        status_str = a.get("status", "?")
        table.add_row(
            a.get("id", ""),
            a.get("name", ""),
            a.get("harness", ""),
            f"[{_status_color(status_str)}]{status_str}[/]",
            a.get("model") or "—",
            _format_time(a.get("process_started_at")),
        )

    console.print(table)
    console.print(f"\n[dim]{len(agents)} agent(s)[/]")


def _resolve_agent_id(base: str, agent_id: str) -> str:
    """Try exact match first, then prefix match against all agents."""
    try:
        get_agent(base, agent_id)
        return agent_id
    except ApiError:
        pass
    # Prefix match
    agents = list_agents(base, limit=200)
    matches = [a["id"] for a in agents if a["id"].startswith(agent_id)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        console.print(f"[red]Ambiguous:[/] {agent_id} matches {len(matches)} agents")
        sys.exit(1)
    console.print(f"[red]No agent matches prefix '{agent_id}'[/]")
    sys.exit(1)


@agent.command("show")
@click.argument("agent_id")
@click.pass_context
def agent_show(ctx, agent_id):
    """Show detailed agent info."""
    base = ctx.obj["BASE_URL"]
    agent_id = _resolve_agent_id(base, agent_id)
    try:
        a = get_agent(base, agent_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    status_str = a.get("status", "?")
    console.print(Panel(
        "\n".join([
            f"[bold]ID:[/]        {a.get('id', '')}",
            f"[bold]Name:[/]      {a.get('name', '')}",
            f"[bold]Harness:[/]   {a.get('harness', '')}",
            f"[bold]Status:[/]    [{_status_color(status_str)}]{status_str}[/]",
            f"[bold]Model:[/]     {a.get('model') or '—'}",
            f"[bold]Provider:[/]  {a.get('provider') or '—'}",
            f"[bold]PID:[/]       {a.get('pid') or '—'}",
            f"[bold]Sandbox:[/]   {'yes' if a.get('sandboxed') else 'no'}",
            f"[bold]Skills:[/]    {', '.join(a.get('skills', [])) or '—'}",
            f"[bold]Started:[/]   {_format_time(a.get('process_started_at'))}",
            f"[bold]Endpoint:[/]  {a.get('endpoint') or '—'}",
        ]),
        title=f"[bold]Agent: {a.get('name', agent_id)}[/]",
        box=box.ROUNDED,
    ))


@agent.command("register")
@click.argument("name")
@click.argument("harness")
@click.option("--model", "-m", help="Model name")
@click.option("--provider", "-p", help="Provider")
@click.option("--skill", "-s", multiple=True, help="Skill (repeatable)")
@click.option("--sandbox", is_flag=True, help="Enable sandbox")
@click.pass_context
def agent_register(ctx, name, harness, model, provider, skill, sandbox):
    """Register a new agent."""
    base = ctx.obj["BASE_URL"]
    kwargs = {}
    if model:
        kwargs["model"] = model
    if provider:
        kwargs["provider"] = provider
    if skill:
        kwargs["skills"] = list(skill)
    if sandbox:
        kwargs["sandboxed"] = True

    try:
        result = register_agent(base, name=name, harness=harness, **kwargs)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    console.print(f"[green]✓[/] Registered [bold]{name}[/] ({result.get('id', '')[:8]})")


@agent.command("start")
@click.argument("agent_id")
@click.pass_context
def agent_start(ctx, agent_id):
    """Start an agent."""
    base = ctx.obj["BASE_URL"]
    try:
        result = start_agent(base, agent_id)
        console.print(f"[green]✓[/] Agent [bold]{agent_id[:8]}[/] starting...")
        if "status" in result:
            console.print(f"   Status: [{_status_color(result['status'])}]{result['status']}[/]")
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")


@agent.command("stop")
@click.argument("agent_id")
@click.pass_context
def agent_stop(ctx, agent_id):
    """Stop an agent."""
    base = ctx.obj["BASE_URL"]
    try:
        result = stop_agent(base, agent_id)
        console.print(f"[green]✓[/] Agent [bold]{agent_id[:8]}[/] stopping...")
        if "status" in result:
            console.print(f"   Status: [{_status_color(result['status'])}]{result['status']}[/]")
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")


@agent.command("restart")
@click.argument("agent_id")
@click.pass_context
def agent_restart(ctx, agent_id):
    """Restart an agent."""
    base = ctx.obj["BASE_URL"]
    try:
        result = restart_agent(base, agent_id)
        console.print(f"[green]✓[/] Agent [bold]{agent_id[:8]}[/] restarting...")
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")


@agent.command("delete")
@click.argument("agent_id")
@click.confirmation_option("--yes", "-y", help="Skip confirmation")
@click.pass_context
def agent_delete(ctx, agent_id, yes):
    """Delete an agent registration."""
    if not yes:
        click.confirm(f"Delete agent {agent_id[:8]}?", abort=True)
    base = ctx.obj["BASE_URL"]
    try:
        delete_agent(base, agent_id)
        console.print(f"[green]✓[/] Agent [bold]{agent_id[:8]}[/] deleted")
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")


@agent.command("logs")
@click.argument("agent_id")
@click.option("--lines", "-n", default=50, show_default=True, help="Number of lines")
@click.option("--follow", "-f", is_flag=True, help="Follow (tail -f style)")
@click.pass_context
def agent_logs(ctx, agent_id, lines, follow):
    """Show agent logs."""
    base = ctx.obj["BASE_URL"]

    if follow:
        try:
            while True:
                result = get_agent_logs(base, agent_id, lines=lines)
                log_text = result.get("log", "")
                if log_text:
                    console.clear()
                    console.print(f"[bold]Logs for agent {agent_id[:8]}[/] (polling every 2s, Ctrl+C to stop)")
                    console.print(log_text)
                time.sleep(2)
        except KeyboardInterrupt:
            console.print("\n[yellow]Stopped.[/]")
        except ApiError as e:
            console.print(f"[red]Error:[/] {e}")
        return

    try:
        result = get_agent_logs(base, agent_id, lines=lines)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    log_text = result.get("log", "")
    if log_text:
        console.print(log_text)
    else:
        console.print("[dim]No logs yet.[/]")


@agent.command("metrics")
@click.argument("agent_id")
@click.pass_context
def agent_metrics(ctx, agent_id):
    """Show agent resource metrics."""
    base = ctx.obj["BASE_URL"]
    try:
        result = get_agent_metrics(base, agent_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    metrics = result.get("metrics", {})
    if not metrics:
        console.print("[yellow]No metrics available (agent may not be running).[/]")
        return

    table = Table(box=box.SIMPLE, header_style="bold")
    table.add_column("Metric")
    table.add_column("Value")

    for key, val in metrics.items():
        table.add_row(key.replace("_", " ").title(), str(val))

    console.print(table)


@agent.command("prompt")
@click.argument("agent_id")
@click.argument("message")
@click.option("--session", help="Session ID (creates new if omitted)")
@click.pass_context
def agent_prompt(ctx, agent_id, message, session):
    """Send a prompt to an agent."""
    base = ctx.obj["BASE_URL"]
    try:
        result = prompt_agent(base, agent_id=agent_id, prompt=message, session_id=session)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    console.print(f"[green]✓[/] Prompt sent to [bold]{agent_id[:8]}[/]")
    console.print(f"   Task ID:  {result.get('task_id', '?')[:8]}")
    console.print(f"   Session:  {result.get('session_id', '?')[:8]}")
    console.print(f"   Status:   {result.get('status', '?')}")


# ── Workflow Commands ───────────────────────────────────────────────────────


@cli.group()
def workflow():
    """Manage workflows (list, show, run, validate)."""
    pass


@workflow.command("list")
@click.option("--limit", "-l", default=50, show_default=True)
@click.pass_context
def workflow_list(ctx, limit):
    """List workflows."""
    base = ctx.obj["BASE_URL"]
    try:
        workflows = list_workflows(base, limit=limit)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    if not workflows:
        console.print("[yellow]No workflows found.[/]")
        return

    table = Table(box=box.SIMPLE, header_style="bold")
    table.add_column("ID", style="dim")
    table.add_column("Name")
    table.add_column("Nodes")
    table.add_column("Created")

    for w in workflows:
        nodes = len(w.get("nodes", []))
        table.add_row(
            w.get("id", "")[:8],
            w.get("name", ""),
            str(nodes),
            _format_time(w.get("created_at")),
        )

    console.print(table)


@workflow.command("show")
@click.argument("workflow_id")
@click.pass_context
def workflow_show(ctx, workflow_id):
    """Show workflow details."""
    base = ctx.obj["BASE_URL"]
    try:
        w = get_workflow(base, workflow_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    nodes = w.get("nodes", [])
    edges = w.get("edges", [])

    console.print(Panel(
        "\n".join([
            f"[bold]ID:[/]        {w.get('id', '')}",
            f"[bold]Name:[/]      {w.get('name', '')}",
            f"[bold]Nodes:[/]     {len(nodes)}",
            f"[bold]Edges:[/]     {len(edges)}",
        ]),
        title=f"[bold]Workflow: {w.get('name', workflow_id)}[/]",
        box=box.ROUNDED,
    ))

    if nodes:
        console.print("\n[bold]Nodes:[/]")
        node_table = Table(box=box.SIMPLE, header_style="bold")
        node_table.add_column("Ref")
        node_table.add_column("Type")
        node_table.add_column("Label")
        for n in nodes:
            node_table.add_row(
                n.get("ref_id", "?"),
                n.get("type", "?"),
                n.get("label", n.get("config", {}).get("agent_id", "")),
            )
        console.print(node_table)


@workflow.command("validate")
@click.argument("workflow_id")
@click.pass_context
def workflow_validate(ctx, workflow_id):
    """Validate a workflow DAG."""
    base = ctx.obj["BASE_URL"]
    try:
        result = validate_workflow(base, workflow_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    if result.get("valid"):
        order = result.get("execution_order", [])
        console.print(f"[green]✓[/] Workflow is valid")
        console.print(f"   Execution order: {' → '.join(order)}")
    else:
        console.print(f"[red]�[/] Invalid: {result.get('error', 'Unknown error')}")


@workflow.command("run")
@click.argument("workflow_id")
@click.pass_context
def workflow_run(ctx, workflow_id):
    """Execute a workflow."""
    base = ctx.obj["BASE_URL"]
    try:
        result = execute_workflow(base, workflow_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    console.print(f"[green]✓[/] Workflow [bold]{workflow_id[:8]}[/] execution started")
    console.print(f"   Task ID: {result.get('task_id', '?')[:8]}")
    console.print(f"   Status:  {result.get('status', '?')}")


@workflow.command("tasks")
@click.argument("workflow_id")
@click.pass_context
def workflow_tasks(ctx, workflow_id):
    """List tasks for a workflow."""
    base = ctx.obj["BASE_URL"]
    try:
        tasks = list_workflow_tasks(base, workflow_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    if not tasks:
        console.print("[yellow]No tasks for this workflow.[/]")
        return

    table = Table(box=box.SIMPLE, header_style="bold")
    table.add_column("ID", style="dim")
    table.add_column("Status")
    table.add_column("Nodes")

    for t in tasks:
        node_states = t.get("node_states", {})
        status_str = t.get("status", "?")
        table.add_row(
            t.get("id", "")[:8],
            f"[{_status_color(status_str)}]{status_str}[/]",
            f"{sum(1 for s in node_states.values() if s == 'completed')}/{len(node_states)}",
        )

    console.print(table)


# ── Project Commands ────────────────────────────────────────────────────────


@cli.group()
def project():
    """Manage projects (list, show, create)."""
    pass


@project.command("list")
@click.option("--limit", "-l", default=50, show_default=True)
@click.pass_context
def project_list(ctx, limit):
    """List projects."""
    base = ctx.obj["BASE_URL"]
    try:
        projects = list_projects(base, limit=limit)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    if not projects:
        console.print("[yellow]No projects found.[/]")
        return

    table = Table(box=box.SIMPLE, header_style="bold")
    table.add_column("ID", style="dim")
    table.add_column("Name")
    table.add_column("Description")
    table.add_column("Created")

    for p in projects:
        table.add_row(
            p.get("id", "")[:8],
            p.get("name", ""),
            p.get("description", "") or "—",
            _format_time(p.get("created_at")),
        )

    console.print(table)


@project.command("show")
@click.argument("project_id")
@click.pass_context
def project_show(ctx, project_id):
    """Show project details."""
    base = ctx.obj["BASE_URL"]
    try:
        p = get_project(base, project_id)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    console.print(Panel(
        "\n".join([
            f"[bold]ID:[/]          {p.get('id', '')}",
            f"[bold]Name:[/]        {p.get('name', '')}",
            f"[bold]Description:[/] {p.get('description') or '—'}",
            f"[bold]Memories:[/]    {len(p.get('memory_entries', []))}",
            f"[bold]Sessions:[/]    {len(p.get('sessions', []))}",
        ]),
        title=f"[bold]Project: {p.get('name', project_id)}[/]",
        box=box.ROUNDED,
    ))


@project.command("create")
@click.argument("name")
@click.argument("description", required=False, default="")
@click.pass_context
def project_create(ctx, name, description):
    """Create a new project."""
    base = ctx.obj["BASE_URL"]
    try:
        result = create_project(base, name=name, description=description)
    except ApiError as e:
        console.print(f"[red]Error:[/] {e}")
        return

    console.print(f"[green]✓[/] Project [bold]{name}[/] created ({result.get('id', '')[:8]})")


# ── Raw API Call ────────────────────────────────────────────────────────────


@cli.command()
@click.argument("method")
@click.argument("path")
@click.option("--data", "-d", help="JSON body")
@click.pass_context
def api(ctx, method, path, data):
    """Raw API call (GET/POST/PATCH/DELETE /path)."""
    import httpx
    base = ctx.obj["BASE_URL"]
    url = f"{base}{path}"
    kwargs = {"timeout": 30}
    if data:
        kwargs["json"] = json.loads(data)

    try:
        r = httpx.request(method.upper(), url, **kwargs)
    except Exception as e:
        console.print(f"[red]Error:[/] {e}")
        return

    try:
        console.print_json(r.text)
    except Exception:
        console.print(r.text)


# ── Entry ───────────────────────────────────────────────────────────────────


def main():
    cli(obj={})


if __name__ == "__main__":
    main()
