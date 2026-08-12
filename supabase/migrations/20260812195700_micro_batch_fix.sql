-- Micro-Batch 01: Spelling Correction 'فى ' -> 'في ' (10 occurrences)
UPDATE public.encyclopedia_entities 
SET summary = REPLACE(summary, 'فى ', 'في '), updated_at = NOW() 
WHERE id IN (
    '94908ce8-2862-4599-9b86-3c892c48d863',
    '4948b8ae-0e54-4025-a932-079d2407778b',
    '99e23b89-b896-4915-8828-6d852a138f4f',
    'ab4837ed-5826-4377-92c5-5f2487d8a305',
    '29a1603a-183f-44b4-a4ce-4bc644764fad',
    '69b49601-02c0-47d8-afbe-91d43c4f75f1',
    'd612c52f-6f73-48b5-95f8-29b89c088146',
    'f3151bc7-d46d-4b2c-9013-5af3a1fc5552',
    'fd35673b-8fd2-4038-bf28-62b42e607c29',
    '3377afdd-2b72-4f17-af1c-4897c6889743'
);
