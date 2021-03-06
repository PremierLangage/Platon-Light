@ /utils/sandboxio.py
grader  =@ /grader/evaluator.py
builder =@ /builder/before.py

inputbox =: Input
inputbox.type = number
inputbox.placeholder = Answer
inputbox.maxlength = 2
inputbox.appearance = outline

before==
import random

a = random.randint(1, 10)
b = random.randint(1, 10)
r = a + b
==

title==
Input Component
==

text==
Enter the result of ** {{ aÂ }} + {{Â bÂ }} ** inside the input box.
==

form==
{{ inputbox|component}}
==

evaluator==
if r == inputbox.value:
    grade = (100, '<span class="success-state">Good ððð</span>')
else:
    grade = (0, '<span class="error-state">Bad answer ððð</span>')
==

