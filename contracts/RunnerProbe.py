# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class RunnerProbe(gl.Contract):
    count: u32

    def __init__(self):
        self.count = u32(0)

    @gl.public.write
    def bump(self) -> None:
        self.count = u32(int(self.count) + 1)

    @gl.public.view
    def get_count(self) -> u32:
        return self.count
