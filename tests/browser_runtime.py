"""Chromium test launcher: installed local Chromium or Playwright managed binary."""
import os
from pathlib import Path


def launch_chromium(playwright, **kwargs):
    default_args = ['--no-sandbox']
    options = {'headless': True, 'args': default_args}
    options.update(kwargs)
    executable = os.getenv('CHROMIUM_EXECUTABLE')
    if executable:
        if not Path(executable).is_file():
            raise FileNotFoundError(f'CHROMIUM_EXECUTABLE does not exist: {executable}')
        options['executable_path'] = executable
    elif Path('/usr/bin/chromium').is_file():
        options['executable_path'] = '/usr/bin/chromium'
    return playwright.chromium.launch(**options)
