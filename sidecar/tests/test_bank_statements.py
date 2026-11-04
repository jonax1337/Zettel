"""CAMT.053 / MT940 parsers: both must yield the same unified booking dicts."""
from __future__ import annotations

import pytest

from bank.camt import detect_format, parse_camt053
from bank.mt940 import parse_mt940

CAMT_STATEMENT = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
  <Ntry>
    <Amt Ccy="EUR">119.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <BookgDt><Dt>2025-03-01</Dt></BookgDt><ValDt><Dt>2025-03-02</Dt></ValDt>
    <NtryDtls><TxDtls>
      <Refs><EndToEndId>E2E-1</EndToEndId></Refs>
      <RltdPties><Dbtr><Nm>Kunde GmbH</Nm></Dbtr><Cdtr><Nm>Ich Freiberufler</Nm></Cdtr></RltdPties>
      <RmtInf><Ustrd>RE-2025-0001</Ustrd><Ustrd>Danke</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
  </Ntry>
  <Ntry>
    <Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
    <BookgDt><DtTm>2025-03-05T10:15:00</DtTm></BookgDt>
    <NtryDtls><TxDtls>
      <RltdPties><Dbtr><Nm>Ich Freiberufler</Nm></Dbtr><Cdtr><Nm>Lieferant AG</Nm></Cdtr></RltdPties>
    </TxDtls></NtryDtls>
  </Ntry>
</Stmt></BkToCstmrStmt></Document>"""


class TestCamt:
    def setup_method(self):
        self.credit, self.debit = parse_camt053(CAMT_STATEMENT)

    def test_credit_is_positive_with_payer_as_partner(self):
        assert self.credit["amountCent"] == 11900
        assert self.credit["partyName"] == "Kunde GmbH"

    def test_debit_is_negative_with_payee_as_partner(self):
        assert self.debit["amountCent"] == -5000
        assert self.debit["partyName"] == "Lieferant AG"

    def test_valuta_date_is_read_from_plain_dt_element(self):
        assert self.credit["valutaDate"] == "2025-03-02"

    def test_booking_date_with_time_is_the_fallback(self):
        assert self.debit["valutaDate"] == "2025-03-05"

    def test_purpose_joins_unstructured_remittance(self):
        assert self.credit["purpose"] == "RE-2025-0001 Danke"

    def test_transaction_id_and_currency(self):
        assert self.credit["transactionId"] == "E2E-1"
        assert self.credit["currency"] == "EUR"

    def test_malformed_amount_fails_loudly(self):
        broken = CAMT_STATEMENT.replace("119.00", "1,19")
        with pytest.raises(ValueError, match="1,19"):
            parse_camt053(broken)


MT940_STATEMENT = (
    ":20:STARTUMSE\n"
    ":25:12345678/0123456789\n"
    ":28C:0/1\n"
    ":60F:C250301EUR1000,00\n"
    ":61:2503020302CR119,00NTRFNONREF\n"
    ":86:166?00GUTSCHRIFT?20RE-2025-0001?32Kunde GmbH\n"
    ":62F:C250302EUR1119,00\n"
)


class TestMt940:
    def test_credit_booking(self):
        (booking,) = parse_mt940(MT940_STATEMENT)
        assert booking["amountCent"] == 11900
        assert booking["currency"] == "EUR"
        assert booking["valutaDate"] == "2025-03-02"
        assert set(booking) == {
            "valutaDate", "amountCent", "currency", "partyName", "purpose", "transactionId"
        }


class TestDetectFormat:
    def test_xml_prolog_is_camt(self):
        assert detect_format(CAMT_STATEMENT) == "camt"

    def test_swift_tag_is_mt940(self):
        assert detect_format(MT940_STATEMENT) == "mt940"
