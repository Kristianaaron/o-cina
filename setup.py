"""O-cina CLI packaging."""
from setuptools import setup, find_packages

setup(
    name="o-cina-cli",
    version="0.1.0",
    description="O-cina Agent Command Center CLI companion",
    packages=find_packages(include=["cli", "cli.*"]),
    python_requires=">=3.11",
    install_requires=[
        "click>=8.0",
        "rich>=13.0",
        "httpx>=0.27",
    ],
    entry_points={
        "console_scripts": [
            "o-cina=cli.commands:main",
        ],
    },
)
