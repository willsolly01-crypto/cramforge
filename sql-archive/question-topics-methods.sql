-- ═══════════════════════════════════════════════════════════════
-- CramForge — question topic index
--
-- Purpose: when a student says "I got Exam 1 Question 6 wrong", the app
-- looks the question up here and returns the topic + revision note
-- WITHOUT calling the Anthropic API. Saves credit on the most common
-- interaction in the product.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.question_topics (
  id             bigint generated always as identity primary key,
  subject        text not null,          -- 'Mathematical Methods'
  paper_code     text not null,          -- 'Methods-A-Exam1'
  file_path      text,                   -- links to past_papers.file_path
  section        text,                   -- 'A' (multiple choice) | 'B' | null
  question_no    text not null,          -- '1', '6c', 'MC14'
  marks          int,
  area_of_study  text not null,          -- the four VCE Methods areas
  topic          text not null,          -- 'Differentiation'
  subtopic       text,                   -- 'Product rule'
  note           text,                   -- one-line revision prompt
  unique (paper_code, question_no)
);

create index if not exists question_topics_paper_idx
  on public.question_topics (paper_code);
create index if not exists question_topics_topic_idx
  on public.question_topics (subject, topic);

alter table public.question_topics enable row level security;

drop policy if exists "public read question_topics" on public.question_topics;
create policy "public read question_topics"
  on public.question_topics for select using (true);


-- Safe to re-run.
delete from public.question_topics where subject = 'Mathematical Methods';

insert into public.question_topics
  (subject, paper_code, section, question_no, marks, area_of_study, topic, subtopic, note) values

-- ══ PAPER A — EXAM 1 ══════════════════════════════════════════
('Mathematical Methods','Methods-A-Exam1',null,'1',5,'Calculus','Differentiation','Product and quotient rules','Product rule on x^2 sin(2x); quotient rule with log_e(3x). Remember d/dx log_e(ax) = 1/x.'),
('Mathematical Methods','Methods-A-Exam1',null,'2',4,'Calculus','Antidifferentiation','Reciprocal and exponential forms','Antiderivative of 1/(2x+1) carries a factor of 1/2. Boundary condition finds c.'),
('Mathematical Methods','Methods-A-Exam1',null,'3',3,'Circular functions','Trigonometric equations','Expanded domain','Substituting u = 2x doubles the domain. Write the u-domain down before solving.'),
('Mathematical Methods','Methods-A-Exam1',null,'4',5,'Probability','Discrete random variables','Expected value and conditional probability','Probabilities sum to 1 and E(X) gives a second equation. {X>=2} is a subset of {X>=1}.'),
('Mathematical Methods','Methods-A-Exam1',null,'5',4,'Functions','Inverse functions','Rule, domain and asymptotes','Domain of the inverse is the range of the original. Vertical asymptotes become horizontal.'),
('Mathematical Methods','Methods-A-Exam1',null,'6',7,'Calculus','Cubic graphs and area','Stationary points, sketching, definite integral','Area below the axis is the negative of the integral. Area is never negative.'),
('Mathematical Methods','Methods-A-Exam1',null,'7',4,'Calculus','Numerical integration','Trapezium rule vs exact value','Concave-down curves give an underestimate because chords sit below the curve.'),
('Mathematical Methods','Methods-A-Exam1',null,'8',5,'Probability','Binomial distribution','Exact and conditional probabilities','Pr(X>=1) is fastest via the complement 1 - Pr(X=0).'),
('Mathematical Methods','Methods-A-Exam1',null,'9',3,'Algebra','Simultaneous equations','Parameter and determinant','Determinant zero gives no solution OR infinitely many; substitute back to tell them apart.'),

-- ══ PAPER A — EXAM 2, SECTION A ═══════════════════════════════
('Mathematical Methods','Methods-A-Exam2','A','MC1',1,'Circular functions','Period','Period of tan','Period of tan(nx) is pi/n, not 2pi/n.'),
('Mathematical Methods','Methods-A-Exam2','A','MC2',1,'Functions','Transformations','Order of transformations','Apply dilations and reflections before translations.'),
('Mathematical Methods','Methods-A-Exam2','A','MC3',1,'Functions','Composite functions','Range of a composite','Simplify the composite rule first, then read the range.'),
('Mathematical Methods','Methods-A-Exam2','A','MC4',1,'Algebra','Logarithm laws','Solving log equations','Check candidate solutions against the original domain.'),
('Mathematical Methods','Methods-A-Exam2','A','MC5',1,'Functions','Inverse functions','Restricting the domain','Restrict at the turning point to make a quadratic one-to-one.'),
('Mathematical Methods','Methods-A-Exam2','A','MC6',1,'Calculus','Differentiation','Product rule with trig and exponential','Watch the sign when differentiating cos.'),
('Mathematical Methods','Methods-A-Exam2','A','MC7',1,'Calculus','Tangents','Tangent to y = x log_e(x)','Derivative is log_e(x) + 1 by the product rule.'),
('Mathematical Methods','Methods-A-Exam2','A','MC8',1,'Calculus','Definite integrals','Linearity','Integral of a constant over [a,b] contributes (b-a) times the constant.'),
('Mathematical Methods','Methods-A-Exam2','A','MC9',1,'Calculus','Average value','Average value of a function','Divide the integral by the interval width (b-a).'),
('Mathematical Methods','Methods-A-Exam2','A','MC10',1,'Calculus','Area between curves','Finding intersection points first','Integrate (upper - lower) between the intersection points.'),
('Mathematical Methods','Methods-A-Exam2','A','MC11',1,'Algebra','Index laws','Functional equations','2^(x+y) = 2^x times 2^y.'),
('Mathematical Methods','Methods-A-Exam2','A','MC12',1,'Functions','Solving graphically','Counting solutions','Graph both sides and count intersections over the given domain.'),
('Mathematical Methods','Methods-A-Exam2','A','MC13',1,'Probability','Discrete random variables','Variance of a linear transformation','Var(aX+b) = a^2 Var(X); the constant b has no effect.'),
('Mathematical Methods','Methods-A-Exam2','A','MC14',1,'Probability','Binomial distribution','Cumulative probability','Pr(X>=2) = 1 - Pr(0) - Pr(1).'),
('Mathematical Methods','Methods-A-Exam2','A','MC15',1,'Probability','Normal distribution','Symmetry about the mean','Probabilities of 0.2 and 0.8 are symmetric, so the mean is the midpoint.'),
('Mathematical Methods','Methods-A-Exam2','A','MC16',1,'Probability','Continuous random variables','Finding the constant in a pdf','The total area under a pdf equals 1.'),
('Mathematical Methods','Methods-A-Exam2','A','MC17',1,'Statistics','Confidence intervals','95% interval for a proportion','Margin is 1.96 times sqrt(p-hat(1-p-hat)/n).'),
('Mathematical Methods','Methods-A-Exam2','A','MC18',1,'Probability','Conditional probability','Addition rule then conditioning','Pr(A and B) = Pr(A) + Pr(B) - Pr(A or B).'),
('Mathematical Methods','Methods-A-Exam2','A','MC19',1,'Algebra','Newton''s method','Reading pseudocode','Each loop pass applies x - f(x)/f''(x) once.'),
('Mathematical Methods','Methods-A-Exam2','A','MC20',1,'Calculus','Trapezium rule','Reading pseudocode','Interior ordinates are doubled; the two endpoints are not.'),

-- ══ PAPER A — EXAM 2, SECTION B ═══════════════════════════════
('Mathematical Methods','Methods-A-Exam2','B','1',12,'Calculus','Cubic modelling','Stationary points, inflection, average value','Steepest descent occurs at the point of inflection, where f'''' = 0.'),
('Mathematical Methods','Methods-A-Exam2','B','2',12,'Circular functions','Trigonometric modelling','Tides, inequalities, average value','Over one full period the sine term integrates to zero.'),
('Mathematical Methods','Methods-A-Exam2','B','3',12,'Calculus','Exponential decay','Newton''s method and asymptotes','The horizontal asymptote is the limiting temperature and is never reached.'),
('Mathematical Methods','Methods-A-Exam2','B','4',12,'Statistics','Normal and binomial','Sample proportions and confidence intervals','Use the unrounded probability from earlier parts in later calculations.'),
('Mathematical Methods','Methods-A-Exam2','B','5',12,'Calculus','Families of functions','Parameter, hence-integration, tangents','Maximum value of a x e^(-ax) is 1/e regardless of a.'),

-- ══ PAPER B — EXAM 1 ══════════════════════════════════════════
('Mathematical Methods','Methods-B-Exam1',null,'1',5,'Calculus','Differentiation','Quotient, product and chain rules','Chain rule on sqrt(2x+1) gives 1/sqrt(2x+1).'),
('Mathematical Methods','Methods-B-Exam1',null,'2',4,'Calculus','Antidifferentiation','Trig, log and linear substitution','Antiderivative of (2x+1)^3 divides by 2(n+1).'),
('Mathematical Methods','Methods-B-Exam1',null,'3',3,'Algebra','Logarithm laws','Solving and rejecting solutions','log_e(x) requires x > 0, so reject the negative root.'),
('Mathematical Methods','Methods-B-Exam1',null,'4',5,'Probability','Continuous random variables','Finding k, symmetry, probability','A symmetric density has its mean on the axis of symmetry.'),
('Mathematical Methods','Methods-B-Exam1',null,'5',4,'Functions','Inverse functions','Hyperbola and asymptotes','Swap x and y, then rearrange; asymptotes swap roles too.'),
('Mathematical Methods','Methods-B-Exam1',null,'6',7,'Calculus','Exponential graphs','Stationary points, sketching, range','x^2 e^x is positive except at the origin; the left tail approaches zero from above.'),
('Mathematical Methods','Methods-B-Exam1',null,'7',4,'Algebra','Newton''s method','Iteration and failure cases','The method fails where f''(x) = 0 — division by zero.'),
('Mathematical Methods','Methods-B-Exam1',null,'8',5,'Statistics','Sample proportions','Distribution of P-hat','Convert every statement about P-hat into a statement about the count X.'),
('Mathematical Methods','Methods-B-Exam1',null,'9',3,'Calculus','Stationary points','Discriminant of the derivative','No stationary points means the derivative has no real zeros, so Delta < 0.'),

-- ══ PAPER B — EXAM 2, SECTION A ═══════════════════════════════
('Mathematical Methods','Methods-B-Exam2','A','MC1',1,'Circular functions','Range','Range of a transformed cosine','Range is the mean value plus or minus the amplitude.'),
('Mathematical Methods','Methods-B-Exam2','A','MC2',1,'Algebra','Index and log laws','Solving an exponential equation','Take logs of both sides, then divide by the coefficient of x.'),
('Mathematical Methods','Methods-B-Exam2','A','MC3',1,'Functions','Composite functions','Maximal domain','Need the inner function to land in the domain of the outer one.'),
('Mathematical Methods','Methods-B-Exam2','A','MC4',1,'Functions','Inverse functions','Asymptotes of the inverse','Vertical and horizontal asymptotes swap.'),
('Mathematical Methods','Methods-B-Exam2','A','MC5',1,'Functions','Transformations','Mapping notation','Set X = 2x-1, solve for x, then substitute.'),
('Mathematical Methods','Methods-B-Exam2','A','MC6',1,'Calculus','Differentiation','Chain rule on a square root','Derivative of sqrt(u) is u''/(2 sqrt(u)).'),
('Mathematical Methods','Methods-B-Exam2','A','MC7',1,'Calculus','Second derivative','Point of inflection','Set the second derivative to zero and find the y-value too.'),
('Mathematical Methods','Methods-B-Exam2','A','MC8',1,'Calculus','Definite integrals','Integrating cos(2x)','Antiderivative is sin(2x)/2; check the terminals carefully.'),
('Mathematical Methods','Methods-B-Exam2','A','MC9',1,'Calculus','Definite integrals','Additivity over adjacent intervals','Integrals over adjacent intervals simply add.'),
('Mathematical Methods','Methods-B-Exam2','A','MC10',1,'Calculus','Area','Area under an exponential','Antiderivative of e^x is e^x.'),
('Mathematical Methods','Methods-B-Exam2','A','MC11',1,'Algebra','Simultaneous equations','No solution vs infinitely many','Determinant zero, then substitute back to check consistency.'),
('Mathematical Methods','Methods-B-Exam2','A','MC12',1,'Algebra','Logarithm laws','Combining logs','Coefficients become powers; subtraction becomes division.'),
('Mathematical Methods','Methods-B-Exam2','A','MC13',1,'Probability','Continuous random variables','Median from a pdf','Median m satisfies the integral from the lower limit to m equals 0.5.'),
('Mathematical Methods','Methods-B-Exam2','A','MC14',1,'Probability','Continuous random variables','Expected value from a pdf','E(X) is the integral of x times f(x).'),
('Mathematical Methods','Methods-B-Exam2','A','MC15',1,'Probability','Binomial distribution','Smallest n for a given probability','Solve (1-p)^n < the required value using logs.'),
('Mathematical Methods','Methods-B-Exam2','A','MC16',1,'Probability','Normal distribution','Inverse normal','Feed the cumulative probability, not the tail probability.'),
('Mathematical Methods','Methods-B-Exam2','A','MC17',1,'Statistics','Confidence intervals','Solving for sample size','Half-width equals 1.96 times the standard error; rearrange for n.'),
('Mathematical Methods','Methods-B-Exam2','A','MC18',1,'Probability','Independence','Complementary independent events','If A and B are independent so are their complements.'),
('Mathematical Methods','Methods-B-Exam2','A','MC19',1,'Algebra','Bisection method','Reading pseudocode','Each pass halves the interval and keeps the half containing the sign change.'),
('Mathematical Methods','Methods-B-Exam2','A','MC20',1,'Calculus','Trapezium rule','Applying the rule to e^(-x^2)','Interior ordinates doubled, endpoints not, then multiply by h/2.'),

-- ══ PAPER B — EXAM 2, SECTION B ═══════════════════════════════
('Mathematical Methods','Methods-B-Exam2','B','1',12,'Circular functions','Trigonometric modelling','Ferris wheel, rates, average value','Height rises fastest at the level of the centre of the wheel.'),
('Mathematical Methods','Methods-B-Exam2','B','2',12,'Functions','Quartic graphs','Repeated factors and area','Repeated (squared) factors mean the graph touches the axis rather than crossing.'),
('Mathematical Methods','Methods-B-Exam2','B','3',12,'Calculus','Exponential modelling','Maximum, intervals, average value','Exponential decay eventually beats linear growth, so the product tends to zero.'),
('Mathematical Methods','Methods-B-Exam2','B','4',12,'Statistics','Binomial and confidence intervals','Nested binomials, interval width','Width of a confidence interval scales with 1/sqrt(n).'),
('Mathematical Methods','Methods-B-Exam2','B','5',12,'Calculus','Families of functions','Cubic with parameter, tangents','A tangent meets a cubic again at the root of a repeated factor.'),

-- ══ PAPER C — EXAM 1 ══════════════════════════════════════════
('Mathematical Methods','Methods-C-Exam1',null,'1',5,'Calculus','Differentiation','Tangent function and log chain rule','d/dx tan(ax) = a/cos^2(ax).'),
('Mathematical Methods','Methods-C-Exam1',null,'2',4,'Calculus','Antidifferentiation','Second derivative and two constants','Antidifferentiate twice, using each condition to pin down one constant.'),
('Mathematical Methods','Methods-C-Exam1',null,'3',3,'Circular functions','Trigonometric equations','Phase shift and domain','The substituted domain can start negative, which is where the x=0 solution comes from.'),
('Mathematical Methods','Methods-C-Exam1',null,'4',5,'Probability','Conditional probability','Two-stage tree diagram','Work out the total probability first, then condition on it.'),
('Mathematical Methods','Methods-C-Exam1',null,'5',4,'Functions','Composite functions','Restricting the inner domain','Need the range of g inside the domain of f.'),
('Mathematical Methods','Methods-C-Exam1',null,'6',7,'Calculus','Exponential graphs','Asymptote, intercepts, definite integral','The antiderivative of e^(1-x) is e^(1-x) with a sign change — differentiate to check.'),
('Mathematical Methods','Methods-C-Exam1',null,'7',4,'Calculus','Numerical integration','Trapezium rule and concavity','Concave-up curves give an overestimate because chords sit above the curve.'),
('Mathematical Methods','Methods-C-Exam1',null,'8',5,'Probability','Normal distribution','Symmetry expressed algebraically','Points equidistant from the mean have mirrored tail probabilities.'),
('Mathematical Methods','Methods-C-Exam1',null,'9',3,'Calculus','Tangents','Tangent through a given point','Find the tangent at x=0 in terms of k, then substitute the point.'),

-- ══ PAPER C — EXAM 2, SECTION A ═══════════════════════════════
('Mathematical Methods','Methods-C-Exam2','A','MC1',1,'Circular functions','Range','Amplitude and mean value','Phase shift and period do not affect the range.'),
('Mathematical Methods','Methods-C-Exam2','A','MC2',1,'Algebra','Index and log laws','Solving 5e^(2x) = 40','Divide by the coefficient before taking logs.'),
('Mathematical Methods','Methods-C-Exam2','A','MC3',1,'Functions','Inverse functions','Evaluating an inverse','Solve f(x) = 4 rather than computing f(4).'),
('Mathematical Methods','Methods-C-Exam2','A','MC4',1,'Functions','Composite functions','Order of evaluation','g(f(2)) means evaluate f first.'),
('Mathematical Methods','Methods-C-Exam2','A','MC5',1,'Functions','Range','Restricted quadratic','Check the turning point and both endpoints.'),
('Mathematical Methods','Methods-C-Exam2','A','MC6',1,'Calculus','Differentiation','Chain rule on a power','Bring the power down, reduce it, multiply by the inner derivative.'),
('Mathematical Methods','Methods-C-Exam2','A','MC7',1,'Calculus','Normals','Normal to a curve','Normal gradient is the negative reciprocal of the tangent gradient.'),
('Mathematical Methods','Methods-C-Exam2','A','MC8',1,'Calculus','Definite integrals','Integral of 1/x','Antiderivative is log_e(x); from 1 to e this gives exactly 1.'),
('Mathematical Methods','Methods-C-Exam2','A','MC9',1,'Calculus','Numerical integration','Left endpoint rectangles','Use the left-hand value of each subinterval as the height.'),
('Mathematical Methods','Methods-C-Exam2','A','MC10',1,'Calculus','Area','Signed integrals vs total area','Take the absolute value of each piece before adding.'),
('Mathematical Methods','Methods-C-Exam2','A','MC11',1,'Algebra','Simultaneous equations','Unique solution condition','Unique solution when the determinant is non-zero.'),
('Mathematical Methods','Methods-C-Exam2','A','MC12',1,'Algebra','Logarithm laws','Powers and quotients','log(a^3/b) = 3 log a - log b.'),
('Mathematical Methods','Methods-C-Exam2','A','MC13',1,'Probability','Discrete random variables','Variance from a table','Var(X) = E(X^2) - (E(X))^2.'),
('Mathematical Methods','Methods-C-Exam2','A','MC14',1,'Probability','Binomial distribution','Standard deviation','sd = sqrt(np(1-p)).'),
('Mathematical Methods','Methods-C-Exam2','A','MC15',1,'Probability','Normal distribution','Conditional probability','Divide the smaller tail by the larger one.'),
('Mathematical Methods','Methods-C-Exam2','A','MC16',1,'Probability','Continuous random variables','Exponential density','Integrate the density from the given value upwards.'),
('Mathematical Methods','Methods-C-Exam2','A','MC17',1,'Statistics','Sample proportions','Standard deviation of P-hat','sd = sqrt(p(1-p)/n).'),
('Mathematical Methods','Methods-C-Exam2','A','MC18',1,'Statistics','Confidence intervals','Interpreting the confidence level','The 95% refers to the long-run behaviour of the procedure, not one interval.'),
('Mathematical Methods','Methods-C-Exam2','A','MC19',1,'Algebra','Newton''s method','When the method fails','It fails where the derivative is zero.'),
('Mathematical Methods','Methods-C-Exam2','A','MC20',1,'Algebra','Algorithms','Tracing a while loop','Count the passes until the loop condition fails.'),

-- ══ PAPER C — EXAM 2, SECTION B ═══════════════════════════════
('Mathematical Methods','Methods-C-Exam2','B','1',12,'Functions','Rational functions','Asymptotes, area, tangent','Antiderivative of 3/(x-2) is 3 log_e(x-2).'),
('Mathematical Methods','Methods-C-Exam2','B','2',12,'Statistics','Normal distribution','Binomial follow-up and confidence interval','Convert "5% exceed k" into a cumulative probability of 0.95 first.'),
('Mathematical Methods','Methods-C-Exam2','B','3',12,'Calculus','Optimisation','Tangent-triangle area maximisation','Justify the maximum with a sign test or the second derivative.'),
('Mathematical Methods','Methods-C-Exam2','B','4',12,'Circular functions','Trigonometric modelling','Amplitude, period, rates, average','Maximum rate of change occurs where the cosine factor equals 1.'),
('Mathematical Methods','Methods-C-Exam2','B','5',12,'Functions','Families of functions','Square root family, inverse, intersection','Squaring can introduce spurious roots — check against the original condition.');


-- ── Link the rows to the actual PDFs ─────────────────────────
update public.question_topics q
set file_path = p.file_path
from public.past_papers p
where p.source = 'CramForge'
  and p.file_path like '%' || q.paper_code || '.pdf';


-- ── VERIFY ───────────────────────────────────────────────────
-- Expect 102 rows across 6 paper codes.
select paper_code, count(*) as questions, sum(marks) as marks
from public.question_topics
where subject = 'Mathematical Methods'
group by paper_code order by paper_code;

-- Most-covered topics — useful for the weak-topic feature later.
select area_of_study, topic, count(*) as questions
from public.question_topics
where subject = 'Mathematical Methods'
group by 1,2 order by 3 desc, 1,2;
