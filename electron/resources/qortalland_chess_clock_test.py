import unittest
from qortalland_chess_clock import ChessClock


class ChessClockTest(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.clock = ChessClock("3+2", 1, 1, now=lambda: self.now)
        self.clock.resume()

    def test_move_gets_increment_once_and_transit_time_is_free(self):
        self.now += 5
        reported = self.clock.submit()
        self.assertEqual(reported, 177000)
        self.now += 20
        self.assertEqual(self.clock.snapshot()["remainingMs"], [177000, 180000])
        self.clock.commit({"ply": 1, "clockRemainingMs": reported})
        self.clock.resume()
        self.assertEqual(self.clock.snapshot()["remainingMs"], [177000, 180000])
        self.assertEqual(self.clock.turn, 2)

    def test_reconnect_preserves_thinking_time_without_counting_downtime(self):
        self.now += 12
        self.clock.recover()
        self.now += 60
        self.clock.resume()
        self.now += 3
        self.assertEqual(self.clock.submit(), 167000)

    def test_rolled_back_move_does_not_grant_a_free_increment(self):
        self.now += 5
        self.clock.submit()
        self.clock.recover()
        self.now += 60
        self.clock.resume()
        self.now += 3
        self.assertEqual(self.clock.submit(), 174000)

    def test_only_local_player_can_run_out_of_time(self):
        self.now += 181
        self.assertTrue(self.clock.expired())
        with self.assertRaisesRegex(ValueError, "chess_time_expired"):
            self.clock.submit()
        self.clock.local_seat = 2
        self.assertFalse(self.clock.expired())

    def test_rejects_clock_increases_outside_increment_and_invalid_reports(self):
        for invalid in (None, True, -1, 0, 2000, 182001, float('nan'), "1000"):
            with self.assertRaisesRegex(ValueError, "invalid_chess_clock"):
                self.clock.validate({"ply": 1, "clockRemainingMs": invalid})
        self.clock.validate({"ply": 1, "clockRemainingMs": 181000})
        with self.assertRaisesRegex(ValueError, "invalid_chess_clock"):
            self.clock.validate({"ply": 2, "clockRemainingMs": 181000})


if __name__ == '__main__':
    unittest.main()
