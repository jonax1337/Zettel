"""Bank statement parsing — CAMT.053 (XML) and MT940 (Swift text).

Both formats produce the same unified `Booking` dict, so downstream matching
logic doesn't have to care which file was uploaded.
"""
