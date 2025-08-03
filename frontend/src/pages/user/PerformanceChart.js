// frontend/src/pages/user/PerformanceChart.js
import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';

// Date formatting function: Extracts only the year and month from the date string
const formatDateToYearMonth = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

export default function PerformanceChart({ performance }) {
    const data = performance.map((entry) => ({
        date: formatDateToYearMonth(entry.index),
        value: parseFloat(entry['Portfolio Value']),
    }));

    return (
        <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    label={{
                        value: "Date (Year-Month)",
                        position: "insideBottom",
                        offset: -20,
                        style: { fontSize: 14 },
                    }}
                />
                <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12 }}
                    label={{
                        value: "Portfolio Value",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 14 },
                    }}
                />
                <Tooltip
                    formatter={(value) => `$${value.toFixed(2)}`}
                    labelFormatter={(label) => `Date: ${label}`}
                />
                <Legend verticalAlign="top" height={36} />
                <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#8884d8"
                    name="Portfolio Value"
                    dot={false}
                    strokeWidth={2}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
