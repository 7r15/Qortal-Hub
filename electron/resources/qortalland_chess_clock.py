"""Peer chess clocks. Charge thinking time locally, not packet transit time."""

import time


CHESS_TIME_CONTROLS = {
    "3+2": (180_000, 2_000),
    "5+0": (300_000, 0),
    "5+3": (300_000, 3_000),
    "10+0": (600_000, 0),
    "10+5": (600_000, 5_000),
    "15+10": (900_000, 10_000),
    "30+0": (1_800_000, 0),
}


class ChessClock:
    def __init__(self, preset, white_seat, local_seat, now=time.monotonic):
        base, self.increment = CHESS_TIME_CONTROLS[preset]
        self.remaining = [base, base]
        self.turn = white_seat
        self.local_seat = local_seat
        self.ply = 0
        self.elapsed = 0
        self.started = None
        self.pending = None
        self.now = now

    def elapsed_ms(self):
        return self.elapsed + (max(0, int((self.now() - self.started) * 1000)) if self.started is not None else 0)

    def resume(self):
        if self.started is None and self.pending is None:
            self.started = self.now()

    def pause(self):
        self.elapsed = self.elapsed_ms()
        self.started = None

    def snapshot(self):
        remaining = list(self.remaining)
        remaining[self.turn - 1] = max(0, remaining[self.turn - 1] - self.elapsed_ms())
        if self.pending is not None:
            remaining[self.turn - 1] = self.pending
        return {"remainingMs": remaining, "runningSeat": self.turn if self.started is not None else None}

    def submit(self):
        if self.turn != self.local_seat or self.pending is not None:
            raise ValueError("invalid_clock_turn")
        remaining = self.remaining[self.turn - 1] - self.elapsed_ms()
        if remaining <= 0:
            raise ValueError("chess_time_expired")
        self.pause()
        self.pending = remaining + self.increment
        return self.pending

    def validate(self, move):
        reported = move.get("clockRemainingMs")
        if (type(reported) is not int or reported <= self.increment
                or reported > self.remaining[self.turn - 1] + self.increment
                or move.get("ply") != self.ply + 1):
            raise ValueError("invalid_chess_clock")

    def commit(self, move):
        self.validate(move)
        self.remaining[self.turn - 1] = move["clockRemainingMs"]
        self.turn = 3 - self.turn
        self.ply = move["ply"]
        self.elapsed = 0
        self.started = None
        self.pending = None

    def recover(self):
        self.pause()
        # The elapsed thinking time remains charged if an unacknowledged move
        # is rolled back. A replayed committed move supplies its original time.
        self.pending = None

    def expired(self):
        return self.turn == self.local_seat and self.pending is None and self.remaining[self.turn - 1] <= self.elapsed_ms()
