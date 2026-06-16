import os
import re
import math
import fitz
from PyPDF2 import PdfReader
from typing import List, Iterable
from dataclasses import dataclass
from collections import Counter

@dataclass
class PageContent:
    page_number: int
    text: str

@dataclass
class TextChunk:
    index: int
    text: str

class PDFProcessor:
    def __init__(self, target_tokens: int = 15000):
        self.target_tokens = target_tokens
        self.target_words = int(self.target_tokens / 1.3)
        self.header_footer_threshold = 0.6

    def process_pdf(self, filepath: str) -> List[TextChunk]:
        pages = self.extract_pages(filepath)
        cleaned_pages = self.clean_pages(pages)
        if not cleaned_pages:
            return []
        full_text = "\n\n".join(page.text for page in cleaned_pages)
        return self.chunk_text(full_text)

    def extract_pages(self, filepath: str) -> List[PageContent]:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"PDF file not found: {filepath}")
        try:
            return self._extract_with_pymupdf(filepath)
        except Exception as e:
            print(f"PyMuPDF failed: {e}. Falling back to PyPDF2.")
            return self._extract_with_pypdf2(filepath)

    def _extract_with_pymupdf(self, filepath: str) -> List[PageContent]:
        doc = fitz.open(filepath)
        pages = []
        for index in range(doc.page_count):
            page = doc.load_page(index)
            blocks = page.get_text("blocks", sort=True)
            block_texts = [block[4].strip() for block in blocks if block[4] and block[4].strip()]
            if block_texts:
                pages.append(PageContent(page_number=index + 1, text="\n\n".join(block_texts)))
        if not pages:
            raise ValueError("No text extracted.")
        return pages

    def _extract_with_pypdf2(self, filepath: str) -> List[PageContent]:
        pages = []
        reader = PdfReader(filepath)
        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(PageContent(page_number=index, text=text))
        if not pages:
            raise ValueError("No text extracted.")
        return pages

    def clean_pages(self, pages: Iterable[PageContent]) -> List[PageContent]:
        page_list = [PageContent(p.page_number, self._normalize_text(p.text)) for p in pages]
        repeated_lines = self._detect_repeated_lines(page_list)
        cleaned_pages = []
        for page in page_list:
            lines = [line for line in page.text.splitlines() if line.strip()]
            kept_lines = [line for line in lines if self._canonical_line(line) not in repeated_lines]
            rebuilt = self._rebuild_text(kept_lines)
            if rebuilt.strip():
                cleaned_pages.append(PageContent(page.page_number, rebuilt.strip()))
        return cleaned_pages

    def _normalize_text(self, text: str) -> str:
        text = text.replace("\u00ad", "").replace("\u2009", " ").replace("\u200a", " ").replace("\xa0", " ")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _detect_repeated_lines(self, pages: List[PageContent]) -> set[str]:
        if len(pages) < 2:
            return set()
        line_counter = Counter()
        threshold = max(2, math.ceil(len(pages) * self.header_footer_threshold))
        for page in pages:
            lines = [line.strip() for line in page.text.splitlines() if line.strip()]
            candidate_lines = lines[:3] + lines[-3:]
            for line in candidate_lines:
                canonical = self._canonical_line(line)
                if canonical:
                    line_counter[canonical] += 1
        return {line for line, count in line_counter.items() if count >= threshold}

    def _canonical_line(self, line: str) -> str:
        compact = re.sub(r"\s+", " ", line).strip().lower()
        compact = re.sub(r"\bpage \d+\b", "", compact)
        compact = re.sub(r"^\d+$", "", compact)
        return compact.strip(" -|")

    def _rebuild_text(self, lines: List[str]) -> str:
        paragraphs = []
        current_parts = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if current_parts:
                    paragraphs.append(" ".join(current_parts).strip())
                    current_parts = []
                continue
            if self._starts_new_block(stripped):
                if current_parts:
                    paragraphs.append(" ".join(current_parts).strip())
                    current_parts = []
                paragraphs.append(stripped)
                continue
            if current_parts and self._should_join(current_parts[-1], stripped):
                current_parts.append(stripped)
            else:
                if current_parts:
                    paragraphs.append(" ".join(current_parts).strip())
                current_parts = [stripped]
        if current_parts:
            paragraphs.append(" ".join(current_parts).strip())
        return "\n\n".join(re.sub(r"\s+", " ", p).strip() for p in paragraphs if p.strip())

    def _starts_new_block(self, line: str) -> bool:
        if re.match(r"^[-*•]\s+", line) or re.match(r"^\d+[\).\s]", line): return True
        return self._looks_like_heading(line) or self._looks_like_table_row(line)

    def _should_join(self, previous: str, current: str) -> bool:
        if self._looks_like_table_row(previous) or self._looks_like_table_row(current): return False
        if self._looks_like_heading(current): return False
        if re.search(r"[:.;!?)]$", previous): return False
        return True

    def _looks_like_heading(self, line: str) -> bool:
        words = line.split()
        if not words or len(words) > 14: return False
        alpha_words = [w for w in words if any(c.isalpha() for c in w)]
        if not alpha_words: return False
        return (sum(w[:1].isupper() for w in alpha_words) / len(alpha_words) > 0.8) or line.endswith(":")

    def _looks_like_table_row(self, line: str) -> bool:
        # Check for multiple spaces or tabs first (standard table behavior)
        parts = re.split(r"\s{2,}|\t", line)
        if len(parts) >= 3: 
            return True
            
        # Relaxed constraint to catch standard medical lab lines 
        # (e.g., "Hemoglobin 14.5 g/dL")
        tokens = line.split()
        if len(tokens) >= 3:
            digit_tokens = sum(any(c.isdigit() for c in t) for t in tokens)
            # If at least 2 parts contain numbers (value + unit/range) and it's short, it's a row
            return digit_tokens >= 2
            
        return False

    def chunk_text(self, text: str) -> List[TextChunk]:
        blocks = [b.strip() for b in re.split(r'\n\s*\n', text) if b.strip()]
        refined_blocks = []
        for block in blocks:
            if len(block.split()) > self.target_words:
                sentences = re.split(r'(?<=[.!?])\s+', block)
                refined_blocks.extend([s.strip() for s in sentences if s.strip()])
            else:
                refined_blocks.append(block)

        chunks = []
        current_text, current_words, chunk_index = "", 0, 1
        for block in refined_blocks:
            block_words = len(block.split())
            if current_text and (current_words + block_words > self.target_words):
                chunks.append(TextChunk(index=chunk_index, text=current_text.strip()))
                chunk_index += 1
                current_text, current_words = block, block_words
            else:
                current_text = current_text + "\n\n" + block if current_text else block
                current_words += block_words
        if current_text:
            chunks.append(TextChunk(index=chunk_index, text=current_text.strip()))
        return chunks
