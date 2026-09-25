const express = require("express");
const mysql = require("mysql2/promise");

const app = express();

app.use(express.json());

const dbConfig = {
    host: "localhost",
    user: "root",
    password: ""
};

let pool;

// ======================================================
// VALIDATION FUNCTIONS
// ======================================================

function isPositiveInteger(value) {
    return (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        Number.isInteger(Number(value)) &&
        Number(value) > 0
    );
}

function isNonNegativeInteger(value) {
    return (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        Number.isInteger(Number(value)) &&
        Number(value) >= 0
    );
}

function isNonNegativeNumber(value) {
    return (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !isNaN(Number(value)) &&
        Number(value) >= 0
    );
}

function isValidPhone(phone) {
    return (
        typeof phone === "string" &&
        /^[0-9]{11,15}$/.test(phone)
    );
}

function isValidDate(date) {
    if (typeof date !== "string") {
        return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }

    const parts = date.split("-");

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    const testDate = new Date(
        Date.UTC(year, month - 1, day)
    );

    return (
        testDate.getUTCFullYear() === year &&
        testDate.getUTCMonth() === month - 1 &&
        testDate.getUTCDate() === day
    );
}

// ======================================================
// DATABASE INITIALIZATION
// ======================================================

async function initializeDatabase() {
    const connection = await mysql.createConnection(dbConfig);

    await connection.query(`
        CREATE DATABASE IF NOT EXISTS retail_store
    `);

    await connection.end();

    pool = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: "retail_store",
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    await pool.query(`
        CREATE TABLE IF NOT EXISTS Suppliers (
            SupplierID INT PRIMARY KEY AUTO_INCREMENT,
            SupplierName VARCHAR(255),
            ContactNumber VARCHAR(20)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS Products (
            ProductID INT PRIMARY KEY AUTO_INCREMENT,
            ProductName VARCHAR(255),
            Price DECIMAL(10,2),
            StockQuantity INT,
            SupplierID INT,
            FOREIGN KEY (SupplierID)
            REFERENCES Suppliers(SupplierID)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS Sales (
            SaleID INT PRIMARY KEY AUTO_INCREMENT,
            ProductID INT,
            QuantitySold INT,
            SaleDate DATE,
            FOREIGN KEY (ProductID)
            REFERENCES Products(ProductID)
        )
    `);

    console.log("Database and tables are ready");
}

// ======================================================
// PRODUCTS
// ======================================================

// ======================================================
// CREATE PRODUCT
// ======================================================

app.post("/products", async (req, res) => {
    try {
        const {
            ProductName,
            Price,
            StockQuantity,
            SupplierID
        } = req.body;

        if (
            typeof ProductName !== "string" ||
            ProductName.trim() === ""
        ) {
            return res.status(400).json({
                message: "ProductName is required"
            });
        }

        if (ProductName.trim().length > 255) {
            return res.status(400).json({
                message: "ProductName must not exceed 255 characters"
            });
        }

        if (!isNonNegativeNumber(Price)) {
            return res.status(400).json({
                message: "Price must be a valid non-negative number"
            });
        }

        if (!isNonNegativeInteger(StockQuantity)) {
            return res.status(400).json({
                message: "StockQuantity must be a non-negative integer"
            });
        }

        if (!isPositiveInteger(SupplierID)) {
            return res.status(400).json({
                message: "SupplierID must be a positive integer"
            });
        }

        const [supplier] = await pool.query(
            `
            SELECT SupplierID
            FROM Suppliers
            WHERE SupplierID = ?
            `,
            [SupplierID]
        );

        if (supplier.length === 0) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        const [result] = await pool.query(
            `
            INSERT INTO Products
            (
                ProductName,
                Price,
                StockQuantity,
                SupplierID
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                ProductName.trim(),
                Number(Price),
                Number(StockQuantity),
                Number(SupplierID)
            ]
        );

        res.status(201).json({
            message: "Product created successfully",
            ProductID: result.insertId
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// GET ALL PRODUCTS
// ======================================================

app.get("/products", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM Products
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// ADD CATEGORY
// IMPORTANT: BEFORE /products/:id
// ======================================================

app.post("/products/add-category", async (req, res) => {
    try {
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'retail_store'
            AND TABLE_NAME = 'Products'
            AND COLUMN_NAME = 'Category'
        `);

        if (columns.length > 0) {
            return res.status(400).json({
                message: "Category column already exists"
            });
        }

        await pool.query(`
            ALTER TABLE Products
            ADD COLUMN Category VARCHAR(100)
        `);

        res.json({
            message: "Category column added successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// REMOVE CATEGORY
// IMPORTANT: BEFORE /products/:id
// ======================================================

app.delete("/products/remove-category", async (req, res) => {
    try {
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'retail_store'
            AND TABLE_NAME = 'Products'
            AND COLUMN_NAME = 'Category'
        `);

        if (columns.length === 0) {
            return res.status(400).json({
                message: "Category column does not exist"
            });
        }

        await pool.query(`
            ALTER TABLE Products
            DROP COLUMN Category
        `);

        res.json({
            message: "Category column removed successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// PRODUCT NAME NOT NULL
// ======================================================

app.put("/products/product-name-required", async (req, res) => {
    try {
        const [nullProducts] = await pool.query(`
            SELECT ProductID
            FROM Products
            WHERE ProductName IS NULL
        `);

        if (nullProducts.length > 0) {
            return res.status(400).json({
                message: "Cannot make ProductName NOT NULL because some products have NULL ProductName"
            });
        }

        await pool.query(`
            ALTER TABLE Products
            MODIFY ProductName VARCHAR(255) NOT NULL
        `);

        res.json({
            message: "ProductName is now NOT NULL"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// UPDATE BREAD PRICE
// ======================================================

app.put("/products/bread-price", async (req, res) => {
    try {
        const [result] = await pool.query(`
            UPDATE Products
            SET Price = 25.00
            WHERE ProductName = 'Bread'
        `);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Bread not found"
            });
        }

        res.json({
            message: "Bread price updated to 25.00"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// DELETE EGGS
// ======================================================

app.delete("/products/eggs", async (req, res) => {
    try {
        const [result] = await pool.query(`
            DELETE FROM Products
            WHERE ProductName = 'Eggs'
        `);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Eggs not found"
            });
        }

        res.json({
            message: "Eggs deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// GET PRODUCT BY ID
// ======================================================

app.get("/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                message: "Product ID must be a positive integer"
            });
        }

        const [rows] = await pool.query(
            `
            SELECT *
            FROM Products
            WHERE ProductID = ?
            `,
            [Number(id)]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// UPDATE PRODUCT
// ======================================================

app.put("/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const {
            ProductName,
            Price,
            StockQuantity,
            SupplierID
        } = req.body;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                message: "Product ID must be a positive integer"
            });
        }

        if (
            typeof ProductName !== "string" ||
            ProductName.trim() === ""
        ) {
            return res.status(400).json({
                message: "ProductName is required"
            });
        }

        if (ProductName.trim().length > 255) {
            return res.status(400).json({
                message: "ProductName must not exceed 255 characters"
            });
        }

        if (!isNonNegativeNumber(Price)) {
            return res.status(400).json({
                message: "Price must be a valid non-negative number"
            });
        }

        if (!isNonNegativeInteger(StockQuantity)) {
            return res.status(400).json({
                message: "StockQuantity must be a non-negative integer"
            });
        }

        if (!isPositiveInteger(SupplierID)) {
            return res.status(400).json({
                message: "SupplierID must be a positive integer"
            });
        }

        const [supplier] = await pool.query(
            `
            SELECT SupplierID
            FROM Suppliers
            WHERE SupplierID = ?
            `,
            [Number(SupplierID)]
        );

        if (supplier.length === 0) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        const [result] = await pool.query(
            `
            UPDATE Products
            SET
                ProductName = ?,
                Price = ?,
                StockQuantity = ?,
                SupplierID = ?
            WHERE ProductID = ?
            `,
            [
                ProductName.trim(),
                Number(Price),
                Number(StockQuantity),
                Number(SupplierID),
                Number(id)
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({
            message: "Product updated successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// DELETE PRODUCT
// ======================================================

app.delete("/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                message: "Product ID must be a positive integer"
            });
        }

        const [result] = await pool.query(
            `
            DELETE FROM Products
            WHERE ProductID = ?
            `,
            [Number(id)]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json({
            message: "Product deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// SUPPLIERS
// ======================================================

// ======================================================
// CREATE SUPPLIER
// ======================================================

app.post("/suppliers", async (req, res) => {
    try {
        const {
            SupplierName,
            ContactNumber
        } = req.body;

        if (
            typeof SupplierName !== "string" ||
            SupplierName.trim() === ""
        ) {
            return res.status(400).json({
                message: "SupplierName is required"
            });
        }

        if (SupplierName.trim().length > 255) {
            return res.status(400).json({
                message: "SupplierName must not exceed 255 characters"
            });
        }

        if (!isValidPhone(ContactNumber)) {
            return res.status(400).json({
                message: "ContactNumber must contain 11 to 15 digits"
            });
        }

        const [result] = await pool.query(
            `
            INSERT INTO Suppliers
            (
                SupplierName,
                ContactNumber
            )
            VALUES (?, ?)
            `,
            [
                SupplierName.trim(),
                ContactNumber
            ]
        );

        res.status(201).json({
            message: "Supplier created successfully",
            SupplierID: result.insertId
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// GET ALL SUPPLIERS
// ======================================================

app.get("/suppliers", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM Suppliers
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// CHANGE CONTACT NUMBER
// ======================================================

app.put("/suppliers/contact-number", async (req, res) => {
    try {
        await pool.query(`
            ALTER TABLE Suppliers
            MODIFY ContactNumber VARCHAR(15)
        `);

        res.json({
            message: "ContactNumber changed to VARCHAR(15)"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// UPDATE SUPPLIER
// ======================================================

app.put("/suppliers/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const {
            SupplierName,
            ContactNumber
        } = req.body;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                message: "Supplier ID must be a positive integer"
            });
        }

        if (
            typeof SupplierName !== "string" ||
            SupplierName.trim() === ""
        ) {
            return res.status(400).json({
                message: "SupplierName is required"
            });
        }

        if (SupplierName.trim().length > 255) {
            return res.status(400).json({
                message: "SupplierName must not exceed 255 characters"
            });
        }

        if (!isValidPhone(ContactNumber)) {
            return res.status(400).json({
                message: "ContactNumber must contain 11 to 15 digits"
            });
        }

        const [result] = await pool.query(
            `
            UPDATE Suppliers
            SET
                SupplierName = ?,
                ContactNumber = ?
            WHERE SupplierID = ?
            `,
            [
                SupplierName.trim(),
                ContactNumber,
                Number(id)
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        res.json({
            message: "Supplier updated successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// DELETE SUPPLIER
// ======================================================

app.delete("/suppliers/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                message: "Supplier ID must be a positive integer"
            });
        }

        const [result] = await pool.query(
            `
            DELETE FROM Suppliers
            WHERE SupplierID = ?
            `,
            [Number(id)]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Supplier not found"
            });
        }

        res.json({
            message: "Supplier deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// SALES
// ======================================================

// ======================================================
// RECORD SALE
// ======================================================

app.post("/sales", async (req, res) => {
    try {
        const {
            ProductID,
            QuantitySold,
            SaleDate
        } = req.body;

        if (!isPositiveInteger(ProductID)) {
            return res.status(400).json({
                message: "ProductID must be a positive integer"
            });
        }

        if (!isPositiveInteger(QuantitySold)) {
            return res.status(400).json({
                message: "QuantitySold must be a positive integer"
            });
        }

        if (!isValidDate(SaleDate)) {
            return res.status(400).json({
                message: "SaleDate must be in YYYY-MM-DD format"
            });
        }

        const [product] = await pool.query(
            `
            SELECT ProductID
            FROM Products
            WHERE ProductID = ?
            `,
            [Number(ProductID)]
        );

        if (product.length === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        const [result] = await pool.query(
            `
            INSERT INTO Sales
            (
                ProductID,
                QuantitySold,
                SaleDate
            )
            VALUES (?, ?, ?)
            `,
            [
                Number(ProductID),
                Number(QuantitySold),
                SaleDate
            ]
        );

        res.status(201).json({
            message: "Sale recorded successfully",
            SaleID: result.insertId
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// GET ALL SALES
// ======================================================

app.get("/sales", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM Sales
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// GET SALES FOR SPECIFIC PRODUCT
// ======================================================

app.get("/sales/product/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                message: "Product ID must be a positive integer"
            });
        }

        const [product] = await pool.query(
            `
            SELECT ProductID
            FROM Products
            WHERE ProductID = ?
            `,
            [Number(id)]
        );

        if (product.length === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        const [rows] = await pool.query(
            `
            SELECT *
            FROM Sales
            WHERE ProductID = ?
            `,
            [Number(id)]
        );

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// INITIAL DATA
// ======================================================

app.post("/initialize-data", async (req, res) => {
    try {
        const [supplier] = await pool.query(`
            INSERT INTO Suppliers
            (
                SupplierName,
                ContactNumber
            )
            VALUES
            (
                'FreshFoods',
                '01001234567'
            )
        `);

        const supplierID = supplier.insertId;

        const [milk] = await pool.query(
            `
            INSERT INTO Products
            (
                ProductName,
                Price,
                StockQuantity,
                SupplierID
            )
            VALUES
            (
                'Milk',
                15.00,
                50,
                ?
            )
            `,
            [supplierID]
        );

        await pool.query(
            `
            INSERT INTO Products
            (
                ProductName,
                Price,
                StockQuantity,
                SupplierID
            )
            VALUES
            (
                'Bread',
                10.00,
                30,
                ?
            ),
            (
                'Eggs',
                20.00,
                40,
                ?
            )
            `,
            [
                supplierID,
                supplierID
            ]
        );

        await pool.query(
            `
            INSERT INTO Sales
            (
                ProductID,
                QuantitySold,
                SaleDate
            )
            VALUES
            (
                ?,
                2,
                '2025-05-20'
            )
            `,
            [milk.insertId]
        );

        res.json({
            message: "Initial data inserted successfully"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// REPORTS
// ======================================================

// Total quantity sold for each product

app.get("/reports/total-sold", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.ProductName,
                COALESCE(SUM(s.QuantitySold), 0)
                AS TotalQuantitySold
            FROM Products p
            LEFT JOIN Sales s
                ON p.ProductID = s.ProductID
            GROUP BY
                p.ProductID,
                p.ProductName
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Highest stock product

app.get("/reports/highest-stock", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM Products
            ORDER BY StockQuantity DESC
            LIMIT 1
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Suppliers starting with F

app.get("/reports/suppliers-starting-f", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *
            FROM Suppliers
            WHERE SupplierName LIKE 'F%'
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Products never sold

app.get("/reports/never-sold", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.*
            FROM Products p
            LEFT JOIN Sales s
                ON p.ProductID = s.ProductID
            WHERE s.ProductID IS NULL
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Sales details

app.get("/reports/sales-details", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                p.ProductName,
                s.QuantitySold,
                s.SaleDate
            FROM Sales s
            JOIN Products p
                ON s.ProductID = p.ProductID
        `);

        res.json(rows);

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ======================================================
// ADMIN
// ======================================================

// Create store manager

app.post("/admin/create-store-manager", async (req, res) => {
    let adminConnection;

    try {
        adminConnection = await mysql.createConnection(dbConfig);

        await adminConnection.query(`
            CREATE USER IF NOT EXISTS
            'store_manager'@'localhost'
            IDENTIFIED BY 'store_manager123'
        `);

        await adminConnection.query(`
            GRANT SELECT, INSERT, UPDATE
            ON retail_store.*
            TO 'store_manager'@'localhost'
        `);

        await adminConnection.query(`
            FLUSH PRIVILEGES
        `);

        res.json({
            message: "store_manager created and permissions granted"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });

    } finally {
        if (adminConnection) {
            await adminConnection.end();
        }
    }
});

// Revoke UPDATE

app.post("/admin/revoke-update", async (req, res) => {
    let adminConnection;

    try {
        adminConnection = await mysql.createConnection(dbConfig);

        await adminConnection.query(`
            REVOKE UPDATE
            ON retail_store.*
            FROM 'store_manager'@'localhost'
        `);

        await adminConnection.query(`
            FLUSH PRIVILEGES
        `);

        res.json({
            message: "UPDATE permission revoked from store_manager"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });

    } finally {
        if (adminConnection) {
            await adminConnection.end();
        }
    }
});

// Grant DELETE on Sales only

app.post("/admin/grant-sales-delete", async (req, res) => {
    let adminConnection;

    try {
        adminConnection = await mysql.createConnection(dbConfig);

        await adminConnection.query(`
            GRANT DELETE
            ON retail_store.Sales
            TO 'store_manager'@'localhost'
        `);

        await adminConnection.query(`
            FLUSH PRIVILEGES
        `);

        res.json({
            message: "DELETE permission granted on Sales table only"
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });

    } finally {
        if (adminConnection) {
            await adminConnection.end();
        }
    }
});

// ======================================================
// INVALID JSON ERROR
// ======================================================

app.use((error, req, res, next) => {
    if (
        error instanceof SyntaxError &&
        error.status === 400 &&
        error.body
    ) {
        return res.status(400).json({
            message: "Invalid JSON format"
        });
    }

    next(error);
});

// ======================================================
// START SERVER
// ======================================================
async function startServer() {
    try {
        console.log("Starting server...");

        await initializeDatabase();

        console.log("Database initialized successfully.");

        app.listen(3000, () => {
            console.log("Server running on port 3000");
        });

    } catch (error) {
        console.log("================================");
        console.log("SERVER ERROR:");
        console.log(error);
        console.log("ERROR MESSAGE:");
        console.log(error.message);
        console.log("ERROR STACK:");
        console.log(error.stack);
        console.log("================================");
    }
}

startServer();

