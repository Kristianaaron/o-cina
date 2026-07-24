#!/usr/bin/env python3
"""O-cina CLI — Agent Command Center terminal companion.

Usage:
  o-cina status
  o-cina agent list
  o-cina agent start <id>
  o-cina agent prompt <id> "your message"
  o-cina workflow list
  o-cina project create "My Project"
"""

import sys
import os

# Ensure the project root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cli.commands import main

if __name__ == "__main__":
    main()
