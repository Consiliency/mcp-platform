#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv",
# ]
# ///

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from datetime import datetime

# Add logging to a file to track what's happening
def log_debug(message):
    """Log debug messages to a file."""
    try:
        with open("/tmp/claude_hooks_debug.log", "a") as f:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            f.write(f"[{timestamp}] {message}\n")
            f.flush()
    except:
        pass  # Don't fail if logging fails

try:
    from utils.constants import ensure_session_log_dir
except ImportError:
    # Fallback if utils module is not available
    def ensure_session_log_dir(session_id):
        """Fallback function to ensure session log directory exists."""
        try:
            log_dir = Path("logs") / session_id
            log_dir.mkdir(parents=True, exist_ok=True)
            return log_dir
        except Exception:
            return Path("logs") / "unknown"

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional


def log_user_prompt(session_id, input_data):
    """Log user prompt to session directory."""
    try:
        log_debug(f"Logging user prompt for session: {session_id}")
        # Ensure session log directory exists
        log_dir = ensure_session_log_dir(session_id)
        log_file = log_dir / 'user_prompt_submit.json'
        log_debug(f"Log file path: {log_file}")
        
        # Read existing log data or initialize empty list
        if log_file.exists():
            with open(log_file, 'r') as f:
                try:
                    log_data = json.load(f)
                    log_debug(f"Read existing log data: {len(log_data)} entries")
                except (json.JSONDecodeError, ValueError):
                    log_data = []
                    log_debug("Failed to parse existing log, starting fresh")
        else:
            log_data = []
            log_debug("No existing log file, starting fresh")
        
        # Append the entire input data
        log_data.append(input_data)
        log_debug("Appended new data to log")
        
        # Write back to file with formatting
        with open(log_file, 'w') as f:
            json.dump(log_data, f, indent=2)
        log_debug("Wrote log data to file")
    except Exception as e:
        # Log error but don't crash
        log_debug(f"Warning: Failed to log user prompt: {e}")


def validate_prompt(prompt):
    """
    Validate the user prompt for security or policy violations.
    Returns tuple (is_valid, reason).
    """
    try:
        log_debug(f"Validating prompt: {prompt[:50]}...")
        # Example validation rules (customize as needed)
        blocked_patterns = [
            # Add any patterns you want to block
            # Example: ('rm -rf /', 'Dangerous command detected'),
        ]
        
        prompt_lower = prompt.lower()
        
        for pattern, reason in blocked_patterns:
            if pattern.lower() in prompt_lower:
                log_debug(f"Prompt blocked: {reason}")
                return False, reason
        
        log_debug("Prompt validation passed")
        return True, None
    except Exception as e:
        # If validation fails, allow the prompt but log the error
        log_debug(f"Warning: Prompt validation failed: {e}")
        return True, None


def main():
    log_debug("=== user_prompt_submit.py started ===")
    log_debug(f"PID: {os.getpid()}")
    log_debug(f"Args: {sys.argv}")
    
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser()
        parser.add_argument('--validate', action='store_true', 
                          help='Enable prompt validation')
        parser.add_argument('--log-only', action='store_true',
                          help='Only log prompts, no validation or blocking')
        args = parser.parse_args()
        log_debug(f"Parsed args: validate={args.validate}, log_only={args.log_only}")
        
        # Read JSON input from stdin
        try:
            input_data = json.loads(sys.stdin.read())
            log_debug(f"Read input data, session_id: {input_data.get('session_id', 'unknown')}")
        except json.JSONDecodeError as e:
            log_debug(f"Warning: Failed to parse JSON input: {e}")
            # Exit cleanly to avoid breaking the tool protocol
            sys.exit(0)
        
        # Extract session_id and prompt
        session_id = input_data.get('session_id', 'unknown')
        prompt = input_data.get('prompt', '')
        log_debug(f"Session ID: {session_id}, prompt length: {len(prompt)}")
        
        # Log the user prompt
        log_debug("About to log user prompt")
        log_user_prompt(session_id, input_data)
        log_debug("User prompt logged")
        
        # Validate prompt if requested and not in log-only mode
        if args.validate and not args.log_only:
            log_debug("About to validate prompt")
            is_valid, reason = validate_prompt(prompt)
            if not is_valid:
                # Exit code 2 blocks the prompt with error message
                log_debug(f"Prompt blocked: {reason}")
                print(f"Prompt blocked: {reason}", file=sys.stderr)
                sys.exit(2)
            log_debug("Prompt validation completed")
        
        # Add context information (optional)
        # You can print additional context that will be added to the prompt
        # Example: print(f"Current time: {datetime.now()}")
        
        # Success - prompt will be processed
        log_debug("Exiting with code 0")
        sys.exit(0)
        
    except Exception as e:
        # Handle any other errors gracefully
        log_debug(f"Warning: Unexpected error in user_prompt_submit: {e}")
        log_debug(f"Traceback: {traceback.format_exc()}")
        # Always exit with 0 to avoid breaking the tool protocol
        sys.exit(0)


if __name__ == '__main__':
    main()