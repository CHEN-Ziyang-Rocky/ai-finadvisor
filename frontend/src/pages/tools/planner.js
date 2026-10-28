import React, { useState, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import 'chart.js/auto';
import './planner.css';
import Modal from '../../assets/modal/Modal';
import { setGoal,deleteGoal, getGoals, addExpenseIncome, getExpenseIncome,updateEndNetIncome,generateSummary } from '../../api';

const SpendingPlanner = () => {
  const [income, setIncome] = useState('');
  const [incomeType, setIncomeType] = useState('');
  const [expenses, setExpenses] = useState('');
  const [expensesType, setExpensesType] = useState('');
  const [miscellaneousGoodsType, setMiscellaneousGoodsType] = useState('');
  const [miscellaneousServicesType, setMiscellaneousServicesType] = useState('');
  const [data, setData] = useState([]);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [goalAmount, setGoalAmount] = useState('');
  const [goalStartDate, setGoalStartDate] = useState('');
  const [goalEndDate, setGoalEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); 
  const [goals, setGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [endNetIncomeModalIsOpen, setEndNetIncomeModalIsOpen] = useState(false);
  const [closingDate, setClosingDate] = useState('');
  const [closedGoalsModalIsOpen, setClosedGoalsModalIsOpen] = useState(false);
  const [Insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteGoalModalIsOpen, setDeleteGoalModalIsOpen] = useState(false);
  const [showClosedGoals, setShowClosedGoals] = useState(true);
  const [visibleGoals, setVisibleGoals] = useState({}); 
  useEffect(() => {
    const fetchDataAndSummarize = async () => {
        await fetchData(selectedMonth);
        await fetchGoals();
    };

    fetchDataAndSummarize();
}, [selectedMonth]);

useEffect(() => {
    if (data.length > 0 && goals.length >=0) {
        summarizeAndSendData();
    }
}, [data, goals]);

const handleSubmit = async (type, amount, typeDetail) => {
  // Check if the amount is a valid number and not null
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      alert('Please enter a valid number for the amount.');
      return;
  }

  try {
      const expenseData = {
          amount: parseFloat(amount), // Ensure the amount is a number
          type,
          typeDetail,
          MiscellaneousGoodService: typeDetail === 'Miscellaneous goods' 
              ? miscellaneousGoodsType 
              : (typeDetail === 'Miscellaneous services' ? miscellaneousServicesType : '')
      };

      console.log('Submitting data:', expenseData);
      await addExpenseIncome(expenseData);
      alert('Data submitted successfully');
      console.log(`Type: ${type}, Type Detail: ${typeDetail}, Amount: ${amount}, MiscellaneousGoodService: ${expenseData.MiscellaneousGoodService}`);
      fetchData(selectedMonth);
  } catch (error) {
      console.error('Error submitting data:', error);
      alert('Failed to submit data');
  }
};

const fetchData = async (month) => {
    const startDate = new Date(month + '-01').toISOString();
    const endDate = new Date(new Date(month + '-01').getFullYear(), new Date(month + '-01').getMonth() + 1, 0).toISOString();
    
    try {
        const response = await getExpenseIncome(startDate, endDate);
        console.log('Fetched data:', response.data); 
        console.log(response.data);
        setData(response.data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

const fetchGoals = async () => {
  try {
    const response = await getGoals();
    console.log('Fetched goals:', response.data); 
    const mappedGoals = response.data.map(goal => ({
      id: goal.goal_id,
      goalType: goal.goal_type,
      goalAmount: goal.amount,
      startDate: goal.start_date,
      endDate: goal.end_date,
      startNetIncome: goal.start_net_income,
      endNetIncome: goal.end_net_income,
      closeDate: goal.closing_date ? new Date(goal.closing_date).toLocaleDateString() : null
    }));
    setGoals(mappedGoals);
  } catch (error) {
    console.error('Error fetching goals:', error);
  }
};

  const openModal = () => {
    console.log('Opening modal');
    setModalIsOpen(true);
  };
  
  const closeModal = () => {
    console.log('Closing modal');
    setModalIsOpen(false);
  };

  // Aggregate data by type
  const aggregatedData = data.reduce((acc, item) => {
    if (item.IncomeType) {
      if (!acc.income[item.IncomeType]) {
        acc.income[item.IncomeType] = 0;
      }
      acc.income[item.IncomeType] += parseFloat(item.Amount);
    } else if (item.ExpensesType) {
      let expenseKey = item.ExpensesType;
      if (item.ExpensesType === 'Miscellaneous goods' || item.ExpensesType === 'Miscellaneous services') {
        expenseKey = `${item.ExpensesType} - ${item.MiscellaneousGoodService || 'Other'}`;
      }
      if (!acc.expenses[expenseKey]) {
        acc.expenses[expenseKey] = 0;
      }
      acc.expenses[expenseKey] += parseFloat(item.Amount);
    }
    return acc;
  }, { income: {}, expenses: {} });

  const expenseTypes = Object.keys(aggregatedData.expenses);
  const incomeTypes = Object.keys(aggregatedData.income);

  // Predefined colors for expense types
  const expenseColorMap = {
    'Food': '#FF6384',
    'Housing': '#36A2EB',
    'Electricity, gas and water': '#FFCE56',
    'Alcoholic drinks and tobacco': '#4BC0C0',
    'Clothing and footwear': '#9966FF',
    'Durable goods': '#FF9F40',
    'Miscellaneous goods': '#FF5733',
    'Transport': '#C70039',
    'Miscellaneous services': '#900C3F',
    'Entertainment': '#581845',
    'Miscellaneous goods - Proprietary medicines and supplies': '#FFC300',
    'Miscellaneous goods - Newspapers, books and periodicals': '#DAF7A6',
    'Miscellaneous goods - Stationery': '#FF5733',
    'Miscellaneous goods - Soft furnishings': '#C70039',
    'Miscellaneous goods - Cosmetics and personal care products': '#900C3F',
    'Miscellaneous goods - Household cleansing tools and supplies': '#581845',
    'Miscellaneous goods - Jewellery': '#FFC300',
    'Miscellaneous goods - Toys and hobbies': '#DAF7A6',
    'Miscellaneous goods - Purchases of textbooks': '#FF5733',
    'Miscellaneous goods - Household goods, others': '#C70039',
    'Miscellaneous services - School fees': '#900C3F',
    'Miscellaneous services - Other educational charges': '#581845',
    'Miscellaneous services - Medical services': '#FFC300',
    'Miscellaneous services - Cinema entertainment': '#DAF7A6',
    'Miscellaneous services - Package tours': '#FF5733',
    'Miscellaneous services - Expenses on parties': '#C70039',
    'Miscellaneous services - Other entertainment and holiday expenses': '#900C3F',
    'Miscellaneous services - Household services': '#581845',
    'Miscellaneous services - Hair-dressing': '#FFC300',
    'Miscellaneous services - Beauty treatment and fitness services': '#DAF7A6',
    'Miscellaneous services - Information and communications services': '#FF5733',
    'Miscellaneous services - Other services': '#C70039'
  };

  // Predefined colors for income types
  const incomeColorMap = {
    'Salary': 'rgba(0, 255, 13, 0.6)',
    'Business': 'rgba(0, 68, 255, 0.6)',
    'Investment': 'rgba(0, 174, 255, 0.6)',
    'Other': 'rgba(0, 255, 234, 0.6)'
  };

  const chartData = {
    labels: ['Income / Expenses'],
    datasets: [
      {
        label: 'Income',
        data: [Object.values(aggregatedData.income).reduce((a, b) => a + b, 0)],
        backgroundColor: 'rgba(0, 255, 13, 0.6)',
      },
      {
        label: 'Expenses',
        data: [Object.values(aggregatedData.expenses).reduce((a, b) => a + b, 0)],
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
      },
    ],
  };

  const pieChartExpenses = {
    labels: expenseTypes,
    datasets: [
      {
        data: expenseTypes.map(type => aggregatedData.expenses[type]),
        backgroundColor: expenseTypes.map(type => expenseColorMap[type] || 'rgba(201, 203, 207, 0.6)'),
      },
    ],
  };

  const pieChartIncome = {
    labels: incomeTypes,
    datasets: [
      {
        data: incomeTypes.map(type => aggregatedData.income[type]),
        backgroundColor: incomeTypes.map(type => incomeColorMap[type] || 'rgba(201, 203, 207, 0.6)'),
      },
    ],
  };

    // Calculate total income and total expenses
    const totalIncome = Object.values(aggregatedData.income).reduce((a, b) => a + b, 0);
    const totalExpenses = Object.values(aggregatedData.expenses).reduce((a, b) => a + b, 0);
    const remainingAmount = totalIncome - totalExpenses;

    const handleGoalSubmit = async (e) => {
      e.preventDefault();
      try {
        const startNetIncome = remainingAmount;
        const endNetIncome = null;
        const goalType = 'Saving';
        await setGoal({ goalType, goalAmount, startDate: goalStartDate, endDate: goalEndDate, startNetIncome, endNetIncome });
        alert('Data submitted successfully');
        fetchGoals(); 
        closeModal();
      } catch (error) {
        console.error('Error submitting data:', error);
        alert('Failed to submit data');
      }
  };
  const closeDeleteGoalModal = () => {
    setDeleteGoalModalIsOpen(false);
  };
  const openDeleteGoalModal = (goal) => {
    console.log('goal id:',goal.id);
    setSelectedGoal(goal);
    setDeleteGoalModalIsOpen(true);
  };
  
  const handleDeleteGoal = async () => {
    if (selectedGoal) {
      try {
        await deleteGoal(selectedGoal.id);
        alert('Goal deleted successfully');
        fetchGoals(); // Refresh the goals list
        closeDeleteGoalModal();
      } catch (error) {
        console.error('Error deleting goal:', error);
        alert('Failed to delete goal');
      }
    }
  };

  const handleEndNetIncomeSubmit = async () => {
    if (selectedGoal && closingDate) {
      try {
        let endNetIncome;
        const currentDate = new Date().toLocaleDateString('en-CA');
        if (closingDate >= currentDate) {
          endNetIncome = remainingAmount; 
        } else {
          // Find the closest income and expenses creation date within the range of start and end date
          const filteredData = data.filter(item => {
            const itemDate = new Date(item.CreatedAt).toLocaleDateString('en-CA');
            return itemDate >= selectedGoal.startDate && itemDate <= closingDate;
          });
  
          // Calculate the net income based on the selected closing date
          const aggregatedData = filteredData.reduce((acc, item) => {
            if (item.IncomeType) {
              acc.income += parseFloat(item.Amount);
            } else if (item.ExpensesType) {
              acc.expenses += parseFloat(item.Amount);
            }
            return acc;
          }, { income: 0, expenses: 0 });
  
          endNetIncome = aggregatedData.income - aggregatedData.expenses;
        }
        console.log('update: ', selectedGoal.id, endNetIncome, closingDate);
        await updateEndNetIncome(selectedGoal.id, endNetIncome, closingDate);
        alert('End Net Income submitted successfully');
        fetchGoals();
        setEndNetIncomeModalIsOpen(false);
      } catch (error) {
        console.error('Error submitting End Net Income:', error);
        alert('Failed to submit End Net Income');
      }
    }
  };
  const openEndNetIncomeModal = (goal) => {
    setSelectedGoal(goal);
    setEndNetIncomeModalIsOpen(true);
  };
  const summarizeAndSendData = async () => {
    try {
        setLoading(true); // Set loading state to true
        // Calculate income percentages
        const incomePercentages = incomeTypes.reduce((acc, type) => {
            acc[type] = ((aggregatedData.income[type] / totalIncome) * 100).toFixed(2);
            return acc;
        }, {});

        // Calculate expense percentages
        const expensePercentages = expenseTypes.reduce((acc, type) => {
            acc[type] = ((aggregatedData.expenses[type] / totalIncome) * 100).toFixed(2);
            return acc;
        }, {});

        // Summarize the data
        const summary = {
            totalIncome: totalIncome,
            incomePercentages: incomePercentages,
            totalExpenses: totalExpenses,
            expensePercentages_of_totalIncome: expensePercentages,
            remainingAmount: remainingAmount,
            goals: goals.length > 0 ? goals.map(goal => ({
              goalType: goal.goalType,
              goalAmount: goal.goalAmount,
              startDate: goal.startDate,
              endDate: goal.endDate
          })) : [] 
        };
        console.log('Summary:', summary); // Log the summary
        // Send the summarized data to the backend
        const response = await generateSummary(summary);
        if (response && response.response) {
            // Replace newline characters with <br> tags
            const formattedResponse = response.response.replace(/\n/g, '<br>');
            setInsight(formattedResponse);
            console.log('Insight:', formattedResponse); 
        } else {
            console.error('Unexpected response structure:', response);
        }
        setLoading(false); 
    } catch (error) {
        console.error('Error sending summary to backend:', error);
        setLoading(false); 
    }
};
  return (
    <div className='mainContainer'>
      <div className='left-container'>
        <div className='container'>
          <h2>Monthly Income and Expenses</h2>
          <div>
            <p>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  console.log('Selected month changed to:', e.target.value);
                  setSelectedMonth(e.target.value);
                }}
              />
            </p>
          </div>
          <div className='bar-chart-size'>
            <Bar data={chartData} options={{ scales: { x: { stacked: false }, y: { stacked: false } } }} />
          </div>
        </div>
        <div className='pie-chart-container'>
          <div className='pie-chart-size'>
            <h2>Income Ratio</h2>
            <Pie data={pieChartIncome} />
          </div>
          <div className='pie-chart-size'>
            <h2>Expense Ratio</h2>
            <Pie data={pieChartExpenses} />
          </div>
        </div>
        <div className='pie-chart-container'>
          <div className='pie-chart-size'>
            <h2>Expense Ratio (as % of Total Income)</h2>
            <Pie
              data={{
                labels: [
                  ...expenseTypes.map(
                    (type) =>
                      `${type} (${(
                        (aggregatedData.expenses[type] / totalIncome) *
                        100
                      ).toFixed(2)}%)`
                  ),
                  ...(totalExpenses < totalIncome
                    ? [`Net Income (${(((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(2)}%)`]
                    : []), 
                ],
                datasets: [
                  {
                    data: [
                      ...expenseTypes.map(
                        (type) =>
                          ((aggregatedData.expenses[type] / totalIncome) * 100).toFixed(2)
                      ),
                      ...(totalExpenses < totalIncome
                        ? [((totalIncome - totalExpenses) / totalIncome) * 100]
                        : []), 
                    ],
                    backgroundColor: [
                      ...expenseTypes.map(
                        (type) =>
                          expenseColorMap[type] || 'rgba(201, 203, 207, 0.6)'
                      ),
                      ...(totalExpenses < totalIncome ? ['#4CAF50'] : []), 
                    ],
                  },
                ],
              }}
              options={{
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: function (context) {
                        const value = parseFloat(context.raw); // Convert to a number
                        if (!isNaN(value)) {
                          return `${context.label}: ${value.toFixed(2)}%`;
                        } else {
                          return `${context.label}: Invalid value`;
                        }
                      },
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>
      <div className='right-container'>
        <div className='container'>
          <div>
            <h2>Income</h2>
            <input
              type='text'
              placeholder='Enter your monthly income'
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              required
            />
            <select
              value={incomeType}
              onChange={(e) => setIncomeType(e.target.value)}
              required
            >
              <option value="">Select income type</option>
              <option value="Salary">Salary</option>
              <option value="Business">Business</option>
              <option value="Investment">Investment</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <button id='plan' onClick={() => handleSubmit('Income', income, incomeType)}>Submit Income</button>
          <div>
            <h2>Expenses</h2>
            <input
              type='text'
              placeholder='Enter your monthly expenses'
              value={expenses}
              onChange={(e) => setExpenses(e.target.value)}
              required
            />
            <select
              value={expensesType}
              onChange={(e) => setExpensesType(e.target.value)}
              required
            >
              <option value="">Select expense type</option>
              {[
                'Food', 'Housing', 'Electricity, gas and water', 'Alcoholic drinks and tobacco',
                'Clothing and footwear', 'Durable goods', 'Miscellaneous goods', 'Transport',
                'Miscellaneous services'
              ].map((type, index) => (
                <option key={index} value={type}>{type}</option>
              ))}
            </select>
            {expensesType === 'Miscellaneous goods' && (
              <select
                value={miscellaneousGoodsType}
                onChange={(e) => setMiscellaneousGoodsType(e.target.value)}
                required
              >
                <option value="">Select Miscellaneous goods type</option>
                {[
                  'Proprietary medicines and supplies', 'Newspapers, books and periodicals', 'Stationery',
                  'Soft furnishings', 'Cosmetics and personal care products', 'Household cleansing tools and supplies',
                  'Jewellery', 'Toys and hobbies', 'Purchases of textbooks', 'Household goods, others'
                ].map((type, index) => (
                  <option key={index} value={type}>{type}</option>
                ))}
              </select>
            )}
            {expensesType === 'Miscellaneous services' && (
              <select
                value={miscellaneousServicesType}
                onChange={(e) => setMiscellaneousServicesType(e.target.value)}
                required
              >
                <option value="">Select Miscellaneous services type</option>
                {[
                  'School fees', 'Other educational charges', 'Medical services', 'Cinema entertainment',
                  'Package tours', 'Expenses on parties', 'Other entertainment and holiday expenses',
                  'Household services', 'Hair-dressing', 'Beauty treatment and fitness services',
                  'Information and communications services', 'Other services'
                ].map((type, index) => (
                  <option key={index} value={type}>{type}</option>
                ))}
              </select>
            )}
          </div>
          <button id='plan' onClick={() => handleSubmit('Expenses', expenses, expensesType)}>Submit Expenses</button>
        </div>
        <div className='container'>
          <h2>Insight</h2>
          <div id = "insight">
              {loading ? (
                  <p>Loading...</p>
              ) : (
                  <div dangerouslySetInnerHTML={{ __html: Insight }} />
              )}
          </div>
        </div>
        <div className='container'>
        <h2> Saving Goals </h2>
        <button id='plan' onClick={() => setClosedGoalsModalIsOpen(true)}>Show Closed Goals</button>
        <div id = "insight">
          <div>
            {
              goals.filter(goal => goal.endNetIncome === null).map((goal, index) => {
              const remainingDays = Math.ceil((new Date(goal.endDate) - new Date()) / (1000 * 60 * 60 * 24));
              const goalClass = remainingDays <= 0 ? 'red-text' : '';
              return (
                <div key={index} className={goalClass}>
                  <h3>Goal {index + 1}: </h3>
                  <p>Goal Amount: {goal.goalAmount}</p>
                  <p>Start Date: {new Date(goal.startDate).toLocaleDateString()}</p>
                  <p>End Date: {new Date(goal.endDate).toLocaleDateString()}</p>
                  <p className={goalClass}>
                    Remaining Days: {remainingDays < 0 ? 'ENDED' : `${remainingDays} Day(s)`}
                  </p>
                  {goal.endNetIncome === null && (
                  <>
                    <button id='plan' className="end-button" onClick={() => openEndNetIncomeModal(goal)}>Close</button>
                    <button id='plan' className="end-button" onClick={() => openDeleteGoalModal(goal)}>Delete</button>
                  </>
                  )}
                </div>
              );
            })}
            </div>
        </div>
        <button id='plan' onClick={openModal}>Create New Goal</button>
      </div>
      <Modal show={modalIsOpen} onClose={() => setModalIsOpen(false)}>
        <h2>Set New Goal</h2>
        <form onSubmit={handleGoalSubmit}>
          <label>
            Saving Goal Amount:
            <input
              type='number'
              placeholder='Enter goal amount'
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              required
            />
          </label>
          <label>
            Start Date:
            <input
              type='date'
              value={goalStartDate}
              onChange={(e) => setGoalStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            End Date:
            <input
              type='date'
              value={goalEndDate}
              onChange={(e) => setGoalEndDate(e.target.value)}
              required
            />
          </label>
          <button id='plan' type='submit'>Create new goal</button>
        </form>
      </Modal>

      <Modal show={endNetIncomeModalIsOpen} onClose={() => setEndNetIncomeModalIsOpen(false)}>
        <h2>Confirm End Net Income Submission</h2>
        <p>Are you sure you want to submit the current remaining amount as the End Net Income for this goal?</p>
        <label>
          Closing Date:
          <input
            type="date"
            value={closingDate}
            min={selectedGoal ? new Date(selectedGoal.startDate).toLocaleDateString('en-CA') : ''}
            max={new Date().toLocaleDateString('en-CA')}
            onChange={(e) => setClosingDate(e.target.value)}
            required
          />
        </label>
        <button id='plan' onClick={handleEndNetIncomeSubmit}>Confirm</button>
        <button id='plan' onClick={() => setEndNetIncomeModalIsOpen(false)}>Cancel</button>
      </Modal>
      <Modal show={closedGoalsModalIsOpen} onClose={() => setClosedGoalsModalIsOpen(false)}>
        <h2> Closed Goals </h2>
        <div>
          {goals.filter(goal => goal.endNetIncome !== null).map((goal, index) => {
            const savingResult = goal.endNetIncome - goal.startNetIncome; 
            const goalClass = savingResult < goal.goalAmount ? 'red-text' : ''; 

            // Check if this goal is visible
            const isVisible = visibleGoals[goal.id] || false;

            return (
              <div key={index} className={goalClass}>
                <h3
                  onClick={() =>
                    setVisibleGoals(prev => ({
                      ...prev,
                      [goal.id]: !prev[goal.id], 
                    }))
                  }
                  style={{ cursor: 'pointer' }}
                >
                  Closed Goal {index + 1} {isVisible ? '▼' : '▲'}
                </h3>
                {isVisible && ( 
                  <div>
                    <p>Goal Type: {goal.goalType}</p>
                    <p>Goal Amount: {goal.goalAmount}</p>
                    <p>Start Date: {new Date(goal.startDate).toLocaleDateString()}</p>
                    <p>End Date: {new Date(goal.endDate).toLocaleDateString()}</p>
                    <p>Start Net Income: {goal.startNetIncome}</p>
                    <p>End Net Income: {goal.endNetIncome}</p>
                    <p>Saving result: {savingResult}</p>
                    <p>Close date: {goal.closeDate}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button id='plan' onClick={() => setClosedGoalsModalIsOpen(false)}>Close</button>
      </Modal>
      <Modal show={deleteGoalModalIsOpen} onClose={closeDeleteGoalModal}>
        <h2>Confirm Delete Goal</h2>
        <p>Are you sure you want to delete this goal?</p>
        <button id='plan' onClick={handleDeleteGoal}>Confirm</button>
        <button id='plan' onClick={closeDeleteGoalModal}>Cancel</button>
      </Modal>
      </div>
    </div>
  );
};

export default SpendingPlanner;