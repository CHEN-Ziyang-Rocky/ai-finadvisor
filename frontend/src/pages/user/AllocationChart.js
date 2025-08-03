import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AA00FF', '#FF00AA'];

export default function AllocationChart({ allocations, assets }) {
    // Ensure allocations, assets' lengths match
    if (!allocations || allocations.length === 0 || !assets || assets.length === 0) {
        console.warn("No allocations or assets provided:", { allocations, assets });
        return <p style={{ textAlign: 'center', color: 'red' }}>No allocation data available.</p>;
    }

    const data = allocations.map((alloc, index) => ({
        name: assets[index] || `Asset ${index + 1}`, // avoid undefined
        value: alloc * 100, // Convert to percentage
    }));

    console.log("AllocationChart Data:", data);

    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value.toFixed(2)}%`} // percentage format
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
                <Legend />
            </PieChart>
        </ResponsiveContainer>
    );
}